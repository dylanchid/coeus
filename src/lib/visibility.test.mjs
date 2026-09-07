import assert from "node:assert/strict";
import test from "node:test";

import { canSee, canSeeIndirect, isListable, isVisibility, VISIBILITIES } from "./visibility.ts";

const OWNER = { kind: "owner", id: "u1" };
const FOLLOWER = { kind: "follower", id: "u2" };
const SIGNED_IN = { kind: "signed-in", id: "u3" };
const ANON = { kind: "anonymous" };

/**
 * The full sixteen-cell truth table, written out literally rather than
 * generated: a future change to any one cell must be visible in the diff.
 *
 * Columns: [visibility, owner, follower, signed-in, anonymous]
 */
const CAN_SEE_TABLE = [
  ["private", true, false, false, false],
  ["followers", true, true, false, false],
  ["unlisted", true, true, true, true],
  ["public", true, true, true, true],
];

/**
 * `isListable` differs from `canSee` in exactly one row: an unlisted object is
 * readable by anyone with the link but listed only for its owner.
 */
const IS_LISTABLE_TABLE = [
  ["private", true, false, false, false],
  ["followers", true, true, false, false],
  ["unlisted", true, false, false, false],
  ["public", true, true, true, true],
];

for (const [visibility, owner, follower, signedIn, anon] of CAN_SEE_TABLE) {
  test(`canSee: ${visibility}`, () => {
    assert.equal(canSee(visibility, OWNER), owner, "owner");
    assert.equal(canSee(visibility, FOLLOWER), follower, "follower");
    assert.equal(canSee(visibility, SIGNED_IN), signedIn, "signed-in");
    assert.equal(canSee(visibility, ANON), anon, "anonymous");
  });
}

for (const [visibility, owner, follower, signedIn, anon] of IS_LISTABLE_TABLE) {
  test(`isListable: ${visibility}`, () => {
    assert.equal(isListable(visibility, OWNER), owner, "owner");
    assert.equal(isListable(visibility, FOLLOWER), follower, "follower");
    assert.equal(isListable(visibility, SIGNED_IN), signedIn, "signed-in");
    assert.equal(isListable(visibility, ANON), anon, "anonymous");
  });
}

test("isListable excludes unlisted from listings for every non-owner viewer", () => {
  for (const viewer of [FOLLOWER, SIGNED_IN, ANON]) {
    assert.equal(canSee("unlisted", viewer), true, "reachable by link");
    assert.equal(isListable("unlisted", viewer), false, "never listed");
  }
});

test("VISIBILITIES is ordered least to most visible and matches the Postgres enum", () => {
  assert.deepEqual([...VISIBILITIES], ["private", "followers", "unlisted", "public"]);
});

test("isVisibility guards the four values and rejects everything else", () => {
  for (const value of VISIBILITIES) assert.equal(isVisibility(value), true);
  for (const value of ["friends", "hidden", "", null, undefined, 3]) {
    assert.equal(isVisibility(value), false);
  }
});

// ── canSeeIndirect ─────────────────────────────────────────────────────────
//
// The actor is the person whose profile carries the row ("u1" here — the OWNER
// viewer is the actor viewing their own page). The target owner is a different
// person, "t9". A repost / like passes `{ visibility: "public" }` as the row.

const REPOST_ROW = { visibility: "public" };
const TARGET_OWNER_ID = "t9";
const target = (visibility) => ({ visibility, ownerId: TARGET_OWNER_ID });

// A viewer who follows the ACTOR but is otherwise a stranger to the target owner.
const FOLLOWS_ACTOR_ONLY = { kind: "follower", id: "u2" };
// The target owner themselves, looking at someone else's profile.
const TARGET_OWNER_VIEWER = { kind: "owner", id: TARGET_OWNER_ID };

test("canSeeIndirect: a null target is invisible to everyone, the actor included", () => {
  for (const viewer of [ANON, SIGNED_IN, FOLLOWER, OWNER]) {
    assert.equal(canSeeIndirect(REPOST_ROW, null, viewer, true), false);
  }
});

test("canSeeIndirect: the revocation scenario — a public collection reposted, then set private", () => {
  // While the collection was public, every viewer saw the repost.
  for (const viewer of [ANON, SIGNED_IN, FOLLOWS_ACTOR_ONLY]) {
    assert.equal(canSeeIndirect(REPOST_ROW, target("public"), viewer, false), true, "before revocation");
  }
  // The owner lowers it to private. It vanishes from every visitor's view —
  // even a viewer who follows the reposter.
  for (const viewer of [ANON, SIGNED_IN, FOLLOWS_ACTOR_ONLY]) {
    assert.equal(canSeeIndirect(REPOST_ROW, target("private"), viewer, false), false, "after revocation");
  }
  // ...but the reposter still sees their own row on their own profile.
  assert.equal(canSeeIndirect(REPOST_ROW, target("private"), OWNER, false), true, "the reposter keeps their row");
});

test("canSeeIndirect: following the ACTOR does not unlock a followers-only target owned by someone else", () => {
  assert.equal(
    canSeeIndirect(REPOST_ROW, target("followers"), FOLLOWS_ACTOR_ONLY, /* viewerFollowsTargetOwner */ false),
    false,
    "follows the reposter, not the collection owner",
  );
  assert.equal(
    canSeeIndirect(REPOST_ROW, target("followers"), FOLLOWS_ACTOR_ONLY, /* viewerFollowsTargetOwner */ true),
    true,
    "now also follows the collection owner",
  );
});

test("canSeeIndirect: the target owner sees a repost of their own now-private object", () => {
  assert.equal(canSeeIndirect(REPOST_ROW, target("private"), TARGET_OWNER_VIEWER, false), true);
});

test("canSeeIndirect: step 1 can fail on its own — a followers-tier reply, public target, anon viewer", () => {
  const reply = { visibility: "followers" };
  assert.equal(canSeeIndirect(reply, target("public"), ANON, true), false, "cannot see the reply itself");
  assert.equal(canSeeIndirect(reply, target("public"), FOLLOWER, true), true, "a follower of the reply author can");
});

/**
 * The full row-is-public matrix: target visibility × the viewer's relationship
 * to the TARGET OWNER. Mirrors CAN_SEE_TABLE exactly, because when the row is
 * public canSeeIndirect reduces to canSee(target, viewer-toward-target-owner).
 * Columns: [target visibility, targetOwner, followsTargetOwner, signed-in, anon]
 */
const INDIRECT_TARGET_TABLE = [
  ["private", true, false, false, false],
  ["followers", true, true, false, false],
  ["unlisted", true, true, true, true],
  ["public", true, true, true, true],
];

for (const [visibility, tOwner, tFollower, tSignedIn, tAnon] of INDIRECT_TARGET_TABLE) {
  test(`canSeeIndirect: public row, target ${visibility}, by relationship to the target owner`, () => {
    const t = target(visibility);
    assert.equal(canSeeIndirect(REPOST_ROW, t, { kind: "owner", id: TARGET_OWNER_ID }, false), tOwner, "target owner");
    assert.equal(canSeeIndirect(REPOST_ROW, t, { kind: "signed-in", id: "z" }, true), tFollower, "follows target owner");
    assert.equal(canSeeIndirect(REPOST_ROW, t, { kind: "signed-in", id: "z" }, false), tSignedIn, "signed-in stranger");
    assert.equal(canSeeIndirect(REPOST_ROW, t, ANON, false), tAnon, "anonymous");
  });
}

test("canSeeIndirect: a like is governed exactly like a repost — same public row, same rules", () => {
  const like = { visibility: "public" };
  assert.equal(canSeeIndirect(like, target("private"), SIGNED_IN, false), false);
  assert.equal(canSeeIndirect(like, target("followers"), SIGNED_IN, true), true);
  assert.equal(canSeeIndirect(like, null, OWNER, true), false);
});
