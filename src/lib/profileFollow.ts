/**
 * Pure request parsing for the person-follow endpoints. The profile analogue
 * of parseFollowRequest() in collectionPublication.ts — same shape, same UUID
 * rule — so the client follow button can be a near-copy of the collection one.
 *
 * No "server-only", no Supabase, no Next import: the parser is exhaustively
 * testable under `node --test` with no database.
 */

/** A public-safe summary of a profile the caller follows, returned by
 * GET /api/profiles/followed. Mirrors the columns a profile card renders. */
export interface FollowedProfile {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ProfileFollowRequest {
  profileId: string;
}

export type ProfileFollowRequestParseResult =
  | { ok: true; value: ProfileFollowRequest }
  | { ok: false; error: string };

export function parseProfileFollowRequest(raw: unknown): ProfileFollowRequestParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Request body must be a JSON object" };
  const unknownField = Object.keys(raw).find((key) => key !== "profileId");
  if (unknownField) return { ok: false, error: `Unknown field: ${unknownField}` };
  if (!isUuid(raw.profileId)) return { ok: false, error: "profileId must be a UUID" };
  return { ok: true, value: { profileId: raw.profileId } };
}
