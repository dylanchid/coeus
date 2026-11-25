import assert from "node:assert/strict";
import test from "node:test";

import { combineFollowedFeed } from "./followedFeed.ts";

const FOLLOWER = { kind: "follower", id: "u1" };

function collection(overrides = {}) {
  return {
    visibility: overrides.visibility ?? "public",
    item: {
      kind: "collection",
      publishedAt: "2026-03-03T00:00:00.000Z",
      publicationId: "pub-1",
      slug: "notes",
      name: "Notes",
      description: "",
      curatorNote: "",
      attribution: "",
      itemCount: 3,
      ...overrides.item,
    },
  };
}

function nonCollectionCandidate(publishedAt) {
  return {
    visibility: "public",
    item: {
      kind: "saved-item",
      publishedAt,
    },
  };
}

test("returns collections only, newest first", () => {
  const page = combineFollowedFeed(
    [
      collection({ item: { publishedAt: "2026-01-01T00:00:00.000Z", slug: "old" } }),
      nonCollectionCandidate("2026-09-09T00:00:00.000Z"),
      collection({ item: { publishedAt: "2026-06-06T00:00:00.000Z", slug: "mid" } }),
    ],
    FOLLOWER,
    10,
    0
  );
  assert.deepEqual(page.items.map((item) => item.slug), ["mid", "old"]);
});

test("a followers-tier collection from a followed author is included; private and unlisted are not", () => {
  const page = combineFollowedFeed(
    [
      collection({ visibility: "followers", item: { slug: "followers-coll" } }),
      collection({ visibility: "private", item: { slug: "private-coll" } }),
      collection({ visibility: "unlisted", item: { slug: "unlisted-coll" } }),
      collection({ visibility: "public", item: { slug: "public-coll" } }),
    ],
    FOLLOWER,
    10,
    0
  );
  assert.deepEqual(page.items.map((item) => item.slug).sort(), ["followers-coll", "public-coll"]);
});

test("hasMore is true when the visible union exceeds offset + limit", () => {
  const candidates = Array.from({ length: 5 }, (_, i) =>
    collection({ item: { publishedAt: `2026-0${i + 1}-01T00:00:00.000Z`, slug: `c${i}` } })
  );
  const first = combineFollowedFeed(candidates, FOLLOWER, 2, 0);
  assert.equal(first.items.length, 2);
  assert.equal(first.hasMore, true);
  const last = combineFollowedFeed(candidates, FOLLOWER, 2, 4);
  assert.equal(last.items.length, 1);
  assert.equal(last.hasMore, false);
});