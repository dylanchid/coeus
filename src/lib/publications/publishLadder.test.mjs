import assert from "node:assert/strict";
import test from "node:test";

import {
  LADDER,
  LADDER_HELPERS,
  LADDER_LABELS,
  collectionEyebrowKicker,
  isLadderStep,
  ladderLabel,
} from "./publishLadder.ts";

test("LADDER orders private, unlisted, public", () => {
  assert.deepEqual(LADDER, ["private", "unlisted", "public"]);
});

test("ladder labels and helpers cover every step", () => {
  for (const step of LADDER) {
    assert.equal(LADDER_LABELS[step].length > 0, true);
    assert.equal(LADDER_HELPERS[step].length > 0, true);
  }
  assert.equal(LADDER_LABELS.public, "Published");
});

test("ladderLabel maps public to Published and followers to legacy", () => {
  assert.equal(ladderLabel("public"), "Published");
  assert.equal(ladderLabel("unlisted"), "Unlisted");
  assert.equal(ladderLabel("private"), "Private");
  assert.equal(ladderLabel("followers"), "Followers only (legacy)");
});

test("collectionEyebrowKicker returns bracketed kickers", () => {
  assert.equal(collectionEyebrowKicker("public"), "[PUBLISHED COLLECTION]");
  assert.equal(collectionEyebrowKicker("unlisted"), "[UNLISTED COLLECTION]");
  assert.equal(collectionEyebrowKicker("private"), "[PRIVATE COLLECTION]");
  assert.equal(collectionEyebrowKicker("followers"), "[FOLLOWERS-ONLY COLLECTION]");
});

test("isLadderStep rejects followers", () => {
  assert.equal(isLadderStep("public"), true);
  assert.equal(isLadderStep("followers"), false);
});