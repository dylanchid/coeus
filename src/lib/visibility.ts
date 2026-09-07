/**
 * The one place a read is allowed or denied.
 *
 * Every Phase 2 and Phase 3 read path — profile surfaces, collection pages,
 * the Posts tab, Discover, the followers/following routes — funnels through
 * `canSee` or `isListable`. It exists once, in this file, importing nothing,
 * with an exhaustive test over all sixteen (visibility × viewer) cells.
 *
 * `canSee` is a SECURITY decision: may this viewer read this object at all.
 * The `profiles.show_*` switches are a DISPLAY preference — whether the owner
 * wants a section rendered on their own page — and live in a different module
 * (profileSections.ts) precisely so nobody mistakes a boolean column for a
 * permission. Do not fold the two together.
 *
 * The `unlisted` tier is the subtle one. By `canSee`, an unlisted object is
 * visible to EVERY viewer kind — that is the point of an unlisted link. What
 * makes it "unlisted" is that it is excluded from profile listings and
 * Discover, and that exclusion happens at the QUERY level (a `where visibility
 * in ('public')` on the listing query) OR via `isListable` at a call site that
 * already has the rows in hand. It is never re-derived by comparing visibility
 * strings inline.
 */

export type Visibility = "private" | "followers" | "unlisted" | "public";

/** Least to most visible. Mirrors the `public.visibility` Postgres enum. */
export const VISIBILITIES: readonly Visibility[] = ["private", "followers", "unlisted", "public"];

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === "string" && (VISIBILITIES as readonly string[]).includes(value);
}

/**
 * Who is asking. The caller resolves this once — anonymous vs. signed-in from
 * the session, `follower` from a `profile_follows` lookup, `owner` from an
 * ownership check — so downstream code never re-runs those checks.
 */
export type Viewer =
  | { kind: "anonymous" }
  | { kind: "signed-in"; id: string }
  | { kind: "follower"; id: string }
  | { kind: "owner"; id: string };

/**
 * May this viewer read an object at this visibility tier?
 *
 *   private:   owner only.
 *   followers: owner and follower.
 *   unlisted:  everyone (the tier is a listing rule, not a read rule).
 *   public:    everyone.
 */
export function canSee(visibility: Visibility, viewer: Viewer): boolean {
  switch (visibility) {
    case "private":
      return viewer.kind === "owner";
    case "followers":
      return viewer.kind === "owner" || viewer.kind === "follower";
    case "unlisted":
    case "public":
      return true;
  }
}

/**
 * Does this object belong in a listing rendered for this viewer — a profile
 * tab, Discover, a follower feed?
 *
 * `canSee` AND not (`unlisted` seen by a non-owner). The owner still sees their
 * own unlisted objects in their own listings; nobody else does.
 */
export function isListable(visibility: Visibility, viewer: Viewer): boolean {
  if (!canSee(visibility, viewer)) return false;
  if (visibility === "unlisted" && viewer.kind !== "owner") return false;
  return true;
}
