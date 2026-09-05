import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

export interface OAuthStatePayload {
  archiveId: string;
  nonce: string;
  issuedAt: number;
}

/** A random, per-attempt nonce to embed in the state so a captured redirect can't be replayed after the fact. */
export function createOAuthStateNonce(): string {
  return randomBytes(16).toString("base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Sign an HMAC-protected OAuth `state` parameter (CSRF protection for the Notion OAuth callback). */
export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

export type OAuthStateVerifyResult =
  | { ok: true; value: OAuthStatePayload }
  | { ok: false; error: string };

/** Verify a signed OAuth state token, rejecting bad signatures, malformed payloads, and expired attempts. */
export function verifyOAuthState(token: string, secret: string, now = Date.now()): OAuthStateVerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "Malformed OAuth state" };
  const [body, signature] = parts;

  const expected = Buffer.from(hmac(body, secret), "base64url");
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, error: "OAuth state signature mismatch" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "OAuth state payload is not valid JSON" };
  }
  if (
    !isRecord(payload) ||
    typeof payload.archiveId !== "string" || !payload.archiveId ||
    typeof payload.nonce !== "string" || !payload.nonce ||
    typeof payload.issuedAt !== "number" || !Number.isFinite(payload.issuedAt)
  ) {
    return { ok: false, error: "OAuth state payload is invalid" };
  }
  if (payload.issuedAt > now + CLOCK_SKEW_MS || now - payload.issuedAt > MAX_AGE_MS) {
    return { ok: false, error: "OAuth state has expired" };
  }

  return { ok: true, value: { archiveId: payload.archiveId, nonce: payload.nonce, issuedAt: payload.issuedAt } };
}
