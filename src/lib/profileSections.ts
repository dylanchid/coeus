import { isPublicationVisibility, type PublicationVisibility } from "./collectionPublication.ts";

/**
 * The profile page's section switches: five booleans plus the Likes list's own
 * visibility tier. These are a DISPLAY preference — whether the owner wants a
 * section rendered on their own page — never an authorization boundary (that is
 * canSee() in src/lib/visibility.ts). This module owns both sides:
 *
 *   - parseProfileSectionsPatch(): validates the partial update the
 *     PATCH /api/account/profile/sections endpoint accepts.
 *   - visibleSections(): the read-side helper the view layer uses to decide
 *     which sections cross to a given viewer.
 *
 * Pure by contract — no "server-only", no Supabase — so both are testable under
 * `node --test` with no database.
 */

export type ProfileSectionKey = "followers" | "following" | "reposts" | "replies" | "likes";

export const PROFILE_SECTION_KEYS: readonly ProfileSectionKey[] = [
  "followers",
  "following",
  "reposts",
  "replies",
  "likes",
];

/** The owner's stored switches, as read from the profiles row. */
export interface ProfileSectionSwitches {
  showFollowers: boolean;
  showFollowing: boolean;
  showReposts: boolean;
  showReplies: boolean;
  showLikes: boolean;
  likesVisibility: PublicationVisibility;
}

/**
 * The column defaults from 20260906160000_profile_follows.sql: every section
 * on, likes public. Used for a profile row that predates the switch columns or
 * for callers/tests with no row to read.
 */
export const DEFAULT_SECTION_SWITCHES: ProfileSectionSwitches = {
  showFollowers: true,
  showFollowing: true,
  showReposts: true,
  showReplies: true,
  showLikes: true,
  likesVisibility: "public",
};

/** Maps a section key to the switch column that governs it. */
const SWITCH_FOR: Record<ProfileSectionKey, keyof ProfileSectionSwitches> = {
  followers: "showFollowers",
  following: "showFollowing",
  reposts: "showReposts",
  replies: "showReplies",
  likes: "showLikes",
};

// ── the PATCH payload ───────────────────────────────────────────────────────

/** Every field optional; the endpoint rejects an empty object as a 400. */
export interface ProfileSectionsPatch {
  showFollowers?: boolean;
  showFollowing?: boolean;
  showReposts?: boolean;
  showReplies?: boolean;
  showLikes?: boolean;
  likesVisibility?: PublicationVisibility;
}

type BooleanKey = "showFollowers" | "showFollowing" | "showReposts" | "showReplies" | "showLikes";

const BOOLEAN_KEYS: readonly BooleanKey[] = [
  "showFollowers",
  "showFollowing",
  "showReposts",
  "showReplies",
  "showLikes",
];

export type ProfileSectionsPatchParseResult =
  | { ok: true; value: ProfileSectionsPatch }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseProfileSectionsPatch(raw: unknown): ProfileSectionsPatchParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Request body must be a JSON object" };

  const allowed = new Set<string>([...BOOLEAN_KEYS, "likesVisibility"]);
  const unknownField = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknownField) return { ok: false, error: `Unknown field: ${unknownField}` };

  const patch: ProfileSectionsPatch = {};
  for (const key of BOOLEAN_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") return { ok: false, error: `${key} must be a boolean` };
    patch[key] = value;
  }

  if (raw.likesVisibility !== undefined) {
    if (!isPublicationVisibility(raw.likesVisibility)) {
      return { ok: false, error: "likesVisibility must be 'private', 'followers', or 'public'" };
    }
    // Mirrors the database check (20260906160000_profile_follows.sql): unlisted
    // is meaningless for a list.
    if (raw.likesVisibility === "unlisted") {
      return { ok: false, error: "likesVisibility cannot be 'unlisted'" };
    }
    patch.likesVisibility = raw.likesVisibility;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Provide at least one section field to update" };
  }
  return { ok: true, value: patch };
}

// ── the read-side helper ────────────────────────────────────────────────────

export interface VisibleSection {
  /**
   * True only ever on the owner's own view: the section is switched off, so it
   * renders marked-as-hidden rather than absent. Always false for anyone else —
   * a switched-off section never appears in their result at all.
   */
  hidden: boolean;
}

export type VisibleSections = Partial<Record<ProfileSectionKey, VisibleSection>>;

/**
 * Which profile sections cross to this viewer.
 *
 *   - For the owner: every section is present, `hidden: true` where the switch
 *     is off, so the editor can render all five with an on/off state.
 *   - For everyone else: a switched-off section is absent entirely — its count
 *     and its list both disappear, never a "0" that hints at hidden rows.
 *
 * The Likes list's `likesVisibility` tier is a separate, canSee()-level
 * decision applied at the call site; this helper is only about the switches.
 */
export function visibleSections(
  switches: ProfileSectionSwitches,
  viewer: { isOwner: boolean }
): VisibleSections {
  const result: VisibleSections = {};
  for (const key of PROFILE_SECTION_KEYS) {
    const on = switches[SWITCH_FOR[key]] === true;
    if (viewer.isOwner) {
      result[key] = { hidden: !on };
    } else if (on) {
      result[key] = { hidden: false };
    }
  }
  return result;
}
