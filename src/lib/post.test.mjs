import assert from "node:assert/strict";
import test from "node:test";

import { derivePostSnapshot, parsePostSnapshot } from "./post.ts";

/** An ArchiveItem with every PRIVATE field set to a recognisable sentinel. */
function itemWithPrivateSentinels() {
  return {
    id: "item-42",
    articleId: "ARTICLEID_SENTINEL",
    title: "How to read an RFC",
    url: "https://example.com/rfc",
    sourceName: "Example",
    topic: "TOPIC_SENTINEL",
    summary: "A short public summary.",
    author: "A. Uthor",
    publishedAt: "2026-01-01T00:00:00.000Z",
    savedAt: "SAVEDAT_SENTINEL",
    state: "kept", // ArchiveState — a non-sentinel value, still must not cross
    starred: true,
    collectionIds: ["c1"],
    tags: ["TAGS_SENTINEL"],
    note: "NOTE_SENTINEL — the private annotation",
  };
}

test("derivePostSnapshot is pure and returns only the public fields", () => {
  const snapshot = derivePostSnapshot(itemWithPrivateSentinels(), {
    visibility: "public",
    commentary: "  worth your time  ",
  });
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "author", "commentary", "excerpt", "itemLocalId", "sourceName", "title", "url", "visibility",
  ]);
  assert.equal(snapshot.itemLocalId, "item-42");
  assert.equal(snapshot.title, "How to read an RFC");
  assert.equal(snapshot.url, "https://example.com/rfc");
  assert.equal(snapshot.excerpt, "A short public summary.");
  assert.equal(snapshot.visibility, "public");
  assert.equal(snapshot.commentary, "worth your time"); // trimmed
});

test("derivePostSnapshot never lets a private ArchiveItem field cross the boundary", () => {
  const snapshot = derivePostSnapshot(itemWithPrivateSentinels(), { visibility: "followers" });
  for (const field of ["note", "tags", "state", "starred", "topic", "savedAt", "articleId"]) {
    assert.equal(Object.hasOwn(snapshot, field), false, `${field} must not be a key of the snapshot`);
  }
  // The load-bearing assertion: no sentinel appears ANYWHERE in the serialised snapshot.
  const serialised = JSON.stringify(snapshot);
  for (const sentinel of [
    "NOTE_SENTINEL", "TAGS_SENTINEL", "TOPIC_SENTINEL", "SAVEDAT_SENTINEL", "ARTICLEID_SENTINEL",
  ]) {
    assert.equal(serialised.includes(sentinel), false, `${sentinel} leaked into the snapshot`);
  }
});

test("derivePostSnapshot sources commentary from options, never from item.note", () => {
  const item = itemWithPrivateSentinels();
  const withoutCommentary = derivePostSnapshot(item, { visibility: "public" });
  assert.equal(withoutCommentary.commentary, "");
  assert.equal(withoutCommentary.commentary.includes("NOTE_SENTINEL"), false);

  const withCommentary = derivePostSnapshot(item, { visibility: "public", commentary: "my take" });
  assert.equal(withCommentary.commentary, "my take");
});

test("derivePostSnapshot caps excerpt and commentary at their limits", () => {
  const item = { ...itemWithPrivateSentinels(), summary: "x".repeat(5000) };
  const snapshot = derivePostSnapshot(item, { visibility: "public", commentary: "y".repeat(9000) });
  assert.equal(snapshot.excerpt.length, 2000);
  assert.equal(snapshot.commentary.length, 4000);
});

test("parsePostSnapshot round-trips a derived snapshot", () => {
  const snapshot = derivePostSnapshot(itemWithPrivateSentinels(), {
    visibility: "unlisted",
    commentary: "note",
  });
  const parsed = parsePostSnapshot(snapshot);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, snapshot);
});

test("parsePostSnapshot accepts every visibility tier", () => {
  for (const visibility of ["private", "followers", "unlisted", "public"]) {
    const parsed = parsePostSnapshot({
      itemLocalId: "i", title: "T", url: "https://e.com", sourceName: "", author: "",
      excerpt: "", commentary: "", visibility,
    });
    assert.equal(parsed.ok, true, `${visibility} should parse`);
  }
});

test("parsePostSnapshot rejects unknown fields", () => {
  const parsed = parsePostSnapshot({
    itemLocalId: "i", title: "T", url: "https://e.com", sourceName: "", author: "",
    excerpt: "", commentary: "", visibility: "public", note: "NOTE_SENTINEL",
  });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Unknown post field: note/);
});

test("parsePostSnapshot rejects a non-http(s) url", () => {
  for (const url of ["ftp://e.com", "javascript:alert(1)", "not a url", ""]) {
    const parsed = parsePostSnapshot({
      itemLocalId: "i", title: "T", url, sourceName: "", author: "",
      excerpt: "", commentary: "", visibility: "public",
    });
    assert.equal(parsed.ok, false, `${url} should be rejected`);
  }
});

test("parsePostSnapshot rejects over-length text", () => {
  const base = {
    itemLocalId: "i", title: "T", url: "https://e.com", sourceName: "", author: "",
    excerpt: "", commentary: "", visibility: "public",
  };
  assert.equal(parsePostSnapshot({ ...base, title: "x".repeat(501) }).ok, false);
  assert.equal(parsePostSnapshot({ ...base, excerpt: "x".repeat(2001) }).ok, false);
  assert.equal(parsePostSnapshot({ ...base, commentary: "x".repeat(4001) }).ok, false);
  assert.equal(parsePostSnapshot({ ...base, sourceName: "x".repeat(201) }).ok, false);
});

test("parsePostSnapshot rejects an empty title and a missing itemLocalId", () => {
  const base = {
    itemLocalId: "i", title: "T", url: "https://e.com", sourceName: "", author: "",
    excerpt: "", commentary: "", visibility: "public",
  };
  assert.equal(parsePostSnapshot({ ...base, title: "" }).ok, false);
  assert.equal(parsePostSnapshot({ ...base, itemLocalId: "" }).ok, false);
});
