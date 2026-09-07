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
 * May this viewer see an INDIRECT row — a like, repost or reply that points at
 * someone else's object — given the CURRENT state of that object?
 *
 * This is the correctness centre of the conversation layer (Phase 3, risk R6).
 * A repost row keeps existing after its target's owner lowers the target's
 * visibility. If the read path checked only the repost, a reposter's profile
 * would leak the existence, title and link of a collection since made private.
 * So visibility resolves TWICE:
 *
 *   1. the row itself, against the viewer's relationship to the ACTOR (the
 *      person whose profile carries the row). Likes and reposts have no per-row
 *      tier — callers pass `{ visibility: "public" }`, the act of endorsing in
 *      public being itself public. A reply passes its own inherited tier.
 *   2. the target, against the viewer's relationship to the TARGET OWNER — a
 *      different person. `viewerFollowsTargetOwner` is resolved by the caller
 *      from `profile_follows`. Following the actor grants nothing here: a repost
 *      of a `followers` collection is visible only to a follower of the
 *      collection's owner.
 *
 * `reposts` and `likes` deliberately store no denormalised copy of their
 * target's title or url — a read that used one would bypass step 2 entirely.
 */
export function canSeeIndirect(
  row: { visibility: Visibility },
  target: { visibility: Visibility; ownerId: string } | null,
  viewer: Viewer,
  viewerFollowsTargetOwner: boolean,
): boolean {
  // An orphaned or deleted target has nothing to show — not to any visitor, and
  // not to the actor either. This unconditional `false` is what lets the daily
  // orphan sweep be hygiene rather than a correctness dependency.
  if (target === null) return false;

  // Step 1: the row, against the viewer ↔ actor relationship.
  if (!canSee(row.visibility, viewer)) return false;

  // The actor always sees their own rows on their own profile: the row is their
  // action. The UI decides how to render a target that has since been
  // restricted; that the row exists is theirs to see. Every other viewer must
  // clear step 2.
  if (viewer.kind === "owner") return true;

  // Step 2: the target, against the viewer ↔ target-owner relationship.
  return canSee(target.visibility, viewerToward(target.ownerId, viewer, viewerFollowsTargetOwner));
}

/** Re-key a viewer onto a different owner: the target-owner check in canSeeIndirect. */
function viewerToward(ownerId: string, viewer: Viewer, follows: boolean): Viewer {
  if (viewer.kind === "anonymous") return { kind: "anonymous" };
  if (viewer.id === ownerId) return { kind: "owner", id: viewer.id };
  if (follows) return { kind: "follower", id: viewer.id };
  return { kind: "signed-in", id: viewer.id };
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
