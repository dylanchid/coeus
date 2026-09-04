import assert from "node:assert/strict";
import test from "node:test";

import { createDemoArchive } from "./archiveFixtures.ts";
import {
  derivePublicationSnapshot,
  isValidSlug,
  parsePublicationSnapshot,
  proposeSlug,
  slugWithSuffix,
} from "./collectionPublication.ts";

function demo() {
  return createDemoArchive();
}

test("proposeSlug produces a valid, url-safe slug from a collection name", () => {
  const slug = proposeSlug("A humane internet");
  assert.ok(isValidSlug(slug));
  assert.equal(slug, "a-humane-internet");
});

test("proposeSlug falls back to a placeholder for names with no slug-safe characters", () => {
  const slug = proposeSlug("!!!");
  assert.ok(isValidSlug(slug));
});

test("slugWithSuffix stays valid and disambiguates a colliding base", () => {
  const base = proposeSlug("Open web field notes");
  const first = slugWithSuffix(base, "ab12cd");
  const second = slugWithSuffix(base, "zz99xx");
  assert.ok(isValidSlug(first));
  assert.ok(isValidSlug(second));
  assert.notEqual(first, second);
  assert.ok(first.startsWith(base));
});

test("derivePublicationSnapshot includes only items from the published collection, in order", () => {
  const archive = demo();
  const collection = archive.collections.find((entry) => entry.id === "humane-internet");
  const snapshot = derivePublicationSnapshot(collection, archive.items, {
    visibility: "unlisted",
    slug: "a-humane-internet",
  });
  assert.equal(snapshot.items.length, 3);
  assert.deepEqual(
    snapshot.items.map((item) => item.itemLocalId),
    ["demo-rfc-8890", "demo-home-cooked", "demo-links"]
  );
  assert.deepEqual(snapshot.items.map((item) => item.position), [0, 1, 2]);
});

test("derivePublicationSnapshot never carries private per-item fields", () => {
  const archive = demo();
  const collection = archive.collections.find((entry) => entry.id === "tools-for-thought");
  const snapshot = derivePublicationSnapshot(collection, archive.items, {
    visibility: "public",
    slug: "tools-for-thought",
  });
  for (const item of snapshot.items) {
    assert.equal(Object.hasOwn(item, "note"), false);
    assert.equal(Object.hasOwn(item, "tags"), false);
    assert.equal(Object.hasOwn(item, "state"), false);
    assert.equal(Object.hasOwn(item, "starred"), false);
    assert.equal(Object.hasOwn(item, "topic"), false);
    assert.equal(Object.hasOwn(item, "savedAt"), false);
  }
  // The private note ("Collections could feel like shared meals...") must never
  // leak into curatorComment unless the publisher explicitly supplies one.
  const homeCooked = snapshot.items.find((item) => item.itemLocalId === "demo-home-cooked");
  assert.equal(homeCooked.curatorComment, "");
});

test("derivePublicationSnapshot only uses curator comments explicitly supplied for that item", () => {
  const archive = demo();
  const collection = archive.collections.find((entry) => entry.id === "humane-internet");
  const snapshot = derivePublicationSnapshot(collection, archive.items, {
    visibility: "public",
    slug: "a-humane-internet",
    curatorNote: "A running list of protocols worth re-reading.",
    attribution: "Curated by You",
    curatorComments: { "demo-rfc-8890": "Start here." },
  });
  assert.equal(snapshot.curatorNote, "A running list of protocols worth re-reading.");
  assert.equal(snapshot.attribution, "Curated by You");
  const rfc = snapshot.items.find((item) => item.itemLocalId === "demo-rfc-8890");
  const links = snapshot.items.find((item) => item.itemLocalId === "demo-links");
  assert.equal(rfc.curatorComment, "Start here.");
  assert.equal(links.curatorComment, "");
});

test("parsePublicationSnapshot round-trips a derived snapshot", () => {
  const archive = demo();
  const collection = archive.collections.find((entry) => entry.id === "open-web-notes");
  const snapshot = derivePublicationSnapshot(collection, archive.items, {
    visibility: "public",
    slug: "open-web-field-notes",
  });
  const parsed = parsePublicationSnapshot(snapshot);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, snapshot);
});

test("parsePublicationSnapshot rejects an invalid slug", () => {
  const result = parsePublicationSnapshot({
    collectionLocalId: "c1",
    slug: "Not A Slug!",
    visibility: "public",
    name: "Test",
    description: "",
    curatorNote: "",
    attribution: "",
    items: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /slug/);
});

test("parsePublicationSnapshot rejects a non-http(s) item url", () => {
  const result = parsePublicationSnapshot({
    collectionLocalId: "c1",
    slug: "test-collection",
    visibility: "unlisted",
    name: "Test",
    description: "",
    curatorNote: "",
    attribution: "",
    items: [
      { itemLocalId: "i1", position: 0, title: "T", url: "javascript:alert(1)", sourceName: "", author: "", excerpt: "", curatorComment: "" },
    ],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /Item 0/);
});

test("parsePublicationSnapshot rejects duplicate itemLocalId values", () => {
  const item = { itemLocalId: "i1", position: 0, title: "T", url: "https://example.com", sourceName: "", author: "", excerpt: "", curatorComment: "" };
  const result = parsePublicationSnapshot({
    collectionLocalId: "c1",
    slug: "test-collection",
    visibility: "unlisted",
    name: "Test",
    description: "",
    curatorNote: "",
    attribution: "",
    items: [item, { ...item, position: 1 }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /duplicate itemLocalId/);
});

test("parsePublicationSnapshot rejects unknown top-level fields", () => {
  const result = parsePublicationSnapshot({
    collectionLocalId: "c1",
    slug: "test-collection",
    visibility: "unlisted",
    name: "Test",
    description: "",
    curatorNote: "",
    attribution: "",
    items: [],
    extra: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown publication field/);
});
