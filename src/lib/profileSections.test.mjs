import assert from "node:assert/strict";
import test from "node:test";

import { parseProfileSectionsPatch, visibleSections } from "./profileSections.ts";

// ── parseProfileSectionsPatch ──────────────────────────────────────────────

test("parseProfileSectionsPatch accepts a partial update", () => {
  const parsed = parseProfileSectionsPatch({ showReposts: false, likesVisibility: "followers" });
  assert.deepEqual(parsed, { ok: true, value: { showReposts: false, likesVisibility: "followers" } });
});

test("parseProfileSectionsPatch rejects an empty object", () => {
  const parsed = parseProfileSectionsPatch({});
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /at least one/);
});

test("parseProfileSectionsPatch rejects a non-object body", () => {
  for (const raw of [null, undefined, "x", 3, [], [true]]) {
    assert.equal(parseProfileSectionsPatch(raw).ok, false);
  }
});

test("parseProfileSectionsPatch rejects unknown keys", () => {
  const parsed = parseProfileSectionsPatch({ showLikes: true, showComments: true });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Unknown field: showComments/);
});

test("parseProfileSectionsPatch rejects a non-boolean switch", () => {
  const parsed = parseProfileSectionsPatch({ showLikes: "yes" });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /showLikes must be a boolean/);
});

test("parseProfileSectionsPatch rejects likesVisibility of unlisted — mirrors the DB check", () => {
  const parsed = parseProfileSectionsPatch({ likesVisibility: "unlisted" });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /unlisted/);
});

test("parseProfileSectionsPatch rejects an invalid likesVisibility", () => {
  assert.equal(parseProfileSectionsPatch({ likesVisibility: "nonsense" }).ok, false);
});

test("parseProfileSectionsPatch accepts likesVisibility of private, followers, public", () => {
  for (const likesVisibility of ["private", "followers", "public"]) {
    assert.equal(parseProfileSectionsPatch({ likesVisibility }).ok, true);
  }
});

// ── visibleSections ────────────────────────────────────────────────────────

const ALL_ON = {
  showFollowers: true,
  showFollowing: true,
  showReposts: true,
  showReplies: true,
  showLikes: true,
  likesVisibility: "public",
};

test("visibleSections: the owner sees every section, marked hidden where switched off", () => {
  const switches = { ...ALL_ON, showReplies: false, showLikes: false };
  const result = visibleSections(switches, { isOwner: true });
  assert.deepEqual(Object.keys(result).sort(), ["followers", "following", "likes", "replies", "reposts"]);
  assert.equal(result.replies.hidden, true);
  assert.equal(result.likes.hidden, true);
  assert.equal(result.followers.hidden, false);
});

test("visibleSections: a non-owner never sees a switched-off section — count and list both gone", () => {
  const switches = { ...ALL_ON, showReplies: false, showLikes: false };
  const result = visibleSections(switches, { isOwner: false });
  assert.deepEqual(Object.keys(result).sort(), ["followers", "following", "reposts"]);
  assert.equal(Object.hasOwn(result, "replies"), false);
  assert.equal(Object.hasOwn(result, "likes"), false);
  for (const section of Object.values(result)) assert.equal(section.hidden, false);
});

test("visibleSections: all-on is all five for both viewers", () => {
  assert.equal(Object.keys(visibleSections(ALL_ON, { isOwner: true })).length, 5);
  assert.equal(Object.keys(visibleSections(ALL_ON, { isOwner: false })).length, 5);
});
