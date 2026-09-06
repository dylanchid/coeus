import {
  mediaObjectPath,
  objectPathFromPublicUrl,
  validateUpload,
  type AllowedMediaType,
  type MediaKind,
} from "./profileUpload.ts";

/**
 * POST /api/account/profile/media — accept one image, store it under the
 * caller's `<uid>/` prefix in the public profile-media bucket, and return the
 * public URL for the client to save into avatar_url / cover_url with a
 * follow-up PUT /api/account/profile.
 *
 * Dependency-injected the same way profileApi.ts is, so the branching (auth,
 * allowlist, size cap, magic bytes, orphan cleanup) is testable with no
 * Supabase client.
 */

export interface ProfileMediaStorage {
  /** Upload bytes to `path`; overwrite is fine (paths carry a random token). */
  upload(path: string, body: ArrayBuffer, contentType: string): Promise<void>;
  /** Best-effort delete; a failure here must not fail the request. */
  remove(paths: string[]): Promise<void>;
  publicUrl(path: string): string;
}

export interface ProfileMediaApiDependencies {
  authenticate(): Promise<string | null>;
  storage: ProfileMediaStorage;
  /** Current avatar/cover URLs, to clean up the file being replaced. */
  currentMedia(userId: string): Promise<{ avatarUrl: string | null; coverUrl: string | null } | null>;
  /** Injectable so the path token is deterministic in tests. */
  randomToken?(): string;
}

const MAGIC_BYTES_HEAD = 16;

function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: headers() });
}

function defaultToken(): string {
  return globalThis.crypto?.randomUUID?.().replace(/-/g, "") ?? Math.random().toString(36).slice(2);
}

export async function handleUploadProfileMedia(
  request: Request,
  dependencies: ProfileMediaApiDependencies
): Promise<Response> {
  const userId = await dependencies.authenticate();
  if (!userId) return error("Authentication required", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Send the image as multipart/form-data", 400);
  }

  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File)) return error("Attach one image in the \"file\" field", 422);

  const buffer = await file.arrayBuffer();
  const check = validateUpload({
    kind,
    declaredType: file.type,
    size: buffer.byteLength,
    bytesHead: new Uint8Array(buffer.slice(0, MAGIC_BYTES_HEAD)),
  });
  if (!check.ok) return error(check.error, check.status);

  const token = (dependencies.randomToken ?? defaultToken)();
  const path = mediaObjectPath(userId, check.kind as MediaKind, check.type as AllowedMediaType, token);

  try {
    await dependencies.storage.upload(path, buffer, check.type);
  } catch {
    return error("The upload could not be stored", 502);
  }

  // Best-effort: remove the file this one replaces, so the bucket does not
  // accumulate orphans. Never let a cleanup failure fail the upload.
  try {
    const current = await dependencies.currentMedia(userId);
    const previousUrl = check.kind === "avatar" ? current?.avatarUrl ?? null : current?.coverUrl ?? null;
    const previousPath = objectPathFromPublicUrl(previousUrl, userId);
    if (previousPath && previousPath !== path) await dependencies.storage.remove([previousPath]);
  } catch {
    // swallow — orphan sweep is not part of this request's contract
  }

  return Response.json({ url: dependencies.storage.publicUrl(path), kind: check.kind }, { headers: headers() });
}
