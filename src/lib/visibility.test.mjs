import assert from "node:assert/strict";
import test from "node:test";

import { canSee, isListable, isVisibility, VISIBILITIES } from "./visibility.ts";

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
