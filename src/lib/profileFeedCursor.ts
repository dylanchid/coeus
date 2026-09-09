/**
 * The keyset cursor for the profile Collections and Posts tabs. A page boundary
 * is the last row's (timestamp, id) pair: the next page is every row ordered
 * strictly after it under `<timestamp> desc, <id> desc`.
 *
 * Pure by contract — no server-only, no Supabase, no next import — so the
 * encode/decode round-trip is testable under `node --test`. The wire form is a
 * single opaque `?cursor=` param; callers must not parse its shape.
 */

export interface ProfileFeedCursor {
  /** ISO timestamp of the last row on the previous page (published_at / created_at). */
  ts: string;
  /** Row id of that same row — the tiebreaker for rows sharing a timestamp. */
  id: string;
}

/** One forward-only page of a profile feed (collections or posts). `nextCursor`
 * is null on the last page. `hasMore` and `nextCursor` always agree. */
export interface ProfileFeedPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ProfileFeedPageRequest {
  /** Decoded cursor; null = first page. */
  cursor: ProfileFeedCursor | null;
  limit: number;
}

/** Default rows per profile-tab page. The existing bt0 caps stay as the hard
 * clamp (see the stores). */
export const PROFILE_FEED_PAGE_SIZE = 24;

const SEP = "|";

/** Encode a cursor for the URL. `null` in ⇒ `null` out (there is no next page). */
export function encodeProfileFeedCursor(cursor: ProfileFeedCursor | null): string | null {
  if (!cursor) return null;
  // base64url keeps the value a single URL token and signals "opaque, do not
  // hand-edit". The id never contains the separator (uuid / slug charset), so a
  // plain join is unambiguous.
  return Buffer.from(`${cursor.ts}${SEP}${cursor.id}`, "utf8").toString("base64url");
}

/** Decode a `?cursor=` value. Anything malformed ⇒ `null`: a bad cursor falls
 * back to the first page rather than 404ing, matching how `resolveProfileTab`
 * treats an unknown `?tab=`. */
export function decodeProfileFeedCursor(raw: string | string[] | undefined | null): ProfileFeedCursor | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !value.length) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const sep = decoded.indexOf(SEP);
  if (sep <= 0 || sep === decoded.length - 1) return null;

  const ts = decoded.slice(0, sep);
  const id = decoded.slice(sep + 1);
  if (Number.isNaN(Date.parse(ts))) return null;

  return { ts, id };
}
