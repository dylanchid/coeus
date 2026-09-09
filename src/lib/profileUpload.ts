/**
 * Pure validation for a profile-media upload. This is the half of the R3
 * defense that lives in the app (the storage policy is the other half): it
 * stops the public bucket becoming a general-purpose file host by refusing
 * anything that is not a small PNG / JPEG / WebP whose *magic bytes* match its
 * declared type.
 *
 * No Supabase, no next — unit-tested with byte fixtures.
 */

export type MediaKind = "avatar" | "cover";

export const MEDIA_KINDS: readonly MediaKind[] = ["avatar", "cover"];

/** Hard size caps, applied before the body is read where the caller can. */
export const MEDIA_SIZE_CAP: Record<MediaKind, number> = {
  avatar: 2 * 1024 * 1024,
  cover: 5 * 1024 * 1024,
};

/**
 * Absolute ceiling for the whole multipart request, checked against
 * `Content-Length` *before* the body is parsed — the largest per-kind cap plus
 * headroom for multipart framing (F-28). The precise per-kind check still runs
 * on the decoded file.
 */
export const MEDIA_REQUEST_BYTE_CEILING = MEDIA_SIZE_CAP.cover + 64 * 1024;

/**
 * Parse a `Content-Length` header to a byte count, or null if it is absent or
 * not a clean non-negative integer.
 */
export function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isSafeInteger(n) ? n : null;
}

export type AllowedMediaType = "image/png" | "image/jpeg" | "image/webp";

const EXTENSION: Record<AllowedMediaType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const ALLOWED_MEDIA_TYPES: readonly AllowedMediaType[] = ["image/png", "image/jpeg", "image/webp"];

export function isMediaKind(value: unknown): value is MediaKind {
  return value === "avatar" || value === "cover";
}

/** Identify an image from its leading bytes, independent of the declared type. */
export function sniffImageType(bytes: Uint8Array): AllowedMediaType | null {
  if (bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) { // "WEBP"
    return "image/webp";
  }
  return null;
}

export type UploadCheck =
  | { ok: true; kind: MediaKind; type: AllowedMediaType }
  | { ok: false; status: number; error: string };

/**
 * Validate a single upload. `bytesHead` need only be the first ~16 bytes for
 * the magic-byte check; `size` is the full declared/actual byte length.
 */
export function validateUpload(input: {
  kind: unknown;
  declaredType: unknown;
  size: number;
  bytesHead: Uint8Array;
}): UploadCheck {
  if (!isMediaKind(input.kind)) {
    return { ok: false, status: 422, error: "kind must be \"avatar\" or \"cover\"." };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, status: 422, error: "The upload is empty." };
  }
  if (input.size > MEDIA_SIZE_CAP[input.kind]) {
    const mb = MEDIA_SIZE_CAP[input.kind] / (1024 * 1024);
    return { ok: false, status: 413, error: `Keep ${input.kind} images under ${mb} MB.` };
  }
  if (typeof input.declaredType !== "string" || !ALLOWED_MEDIA_TYPES.includes(input.declaredType as AllowedMediaType)) {
    return { ok: false, status: 415, error: "Upload a PNG, JPEG, or WebP image." };
  }
  const sniffed = sniffImageType(input.bytesHead);
  if (!sniffed) {
    return { ok: false, status: 415, error: "That file is not a PNG, JPEG, or WebP image." };
  }
  if (sniffed !== input.declaredType) {
    return { ok: false, status: 415, error: "The file contents do not match its declared type." };
  }
  return { ok: true, kind: input.kind, type: sniffed };
}

/**
 * The object path for a fresh upload: `<uid>/<kind>-<random>.<ext>`. The random
 * component means a replacement gets a new URL, so the public CDN never serves
 * a stale image for a reused path.
 */
export function mediaObjectPath(uid: string, kind: MediaKind, type: AllowedMediaType, random: string): string {
  const token = random.replace(/[^a-z0-9]/gi, "").slice(0, 16) || "x";
  return `${uid}/${kind}-${token}.${EXTENSION[type]}`;
}

/**
 * Recover the in-bucket object path from a stored public URL, but only if it
 * genuinely points inside this account's prefix — so a doctored avatar_url can
 * never make the delete step touch another account's object.
 */
export function objectPathFromPublicUrl(url: string | null, uid: string): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/profile-media/";
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split("?")[0];
  return path.startsWith(`${uid}/`) ? path : null;
}
