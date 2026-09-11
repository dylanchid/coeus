import { createHmac, timingSafeEqual } from "node:crypto";

/** Comfortably longer than the card endpoint's own `Cache-Control: max-age=3600`
 *  response so a browser rendering a cached card's <img> never hits an expired link. */
export const PREVIEW_IMAGE_SIGNATURE_TTL_MS = 2 * 60 * 60 * 1000;

function hmac(remoteUrl: string, expires: number, secret: string): string {
  return createHmac("sha256", secret).update(`${remoteUrl}.${expires}`).digest("base64url");
}

export interface SignedPreviewImageUrl {
  expires: number;
  signature: string;
}

/** Sign a remote image URL so `/api/article-preview/image` only serves URLs this
 *  server itself minted via `/api/article-preview/card`, closing the open-proxy shape. */
export function signPreviewImageUrl(remoteUrl: string, secret: string, now = Date.now()): SignedPreviewImageUrl {
  const expires = now + PREVIEW_IMAGE_SIGNATURE_TTL_MS;
  return { expires, signature: hmac(remoteUrl, expires, secret) };
}

/** Verify a signed remote image URL, rejecting bad signatures, malformed expiries, and expired links. */
export function verifyPreviewImageUrl(
  remoteUrl: string,
  expires: number,
  signature: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(expires) || expires < now) return false;

  const expected = Buffer.from(hmac(remoteUrl, expires, secret), "base64url");
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
