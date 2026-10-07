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

function post(overrides = {}) {
  return {
    visibility: overrides.visibility ?? "public",
    item: {
      kind: "post",
      publishedAt: "2026-05-05T00:00:00.000Z",
      title: "Clip",
      url: "https://example.com/x",
      sourceName: "example.com",
      author: "",
      excerpt: "e",
      commentary: "c",
      ...overrides.item,
    },
  };
}

test("merges collections and posts newest first", () => {
  const page = combineFollowedFeed(
    [
      collection({ item: { publishedAt: "2026-01-01T00:00:00.000Z", slug: "old" } }),
      post({ item: { publishedAt: "2026-09-09T00:00:00.000Z", title: "new" } }),
      collection({ item: { publishedAt: "2026-06-06T00:00:00.000Z", slug: "mid" } }),
    ],
    FOLLOWER,
    10,
    0
  );
  assert.deepEqual(
    page.items.map((item) => item.publishedAt),
    ["2026-09-09T00:00:00.000Z", "2026-06-06T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]
  );
});

test("a followers-tier item from a followed author is included; private and unlisted are not", () => {
  const page = combineFollowedFeed(
    [
      post({ visibility: "followers", item: { title: "followers-post" } }),
      post({ visibility: "private", item: { title: "private-post" } }),
      collection({ visibility: "unlisted", item: { slug: "unlisted-coll" } }),
      collection({ visibility: "public", item: { slug: "public-coll" } }),
    ],
    FOLLOWER,
    10,
    0
  );
  const labels = page.items.map((item) => (item.kind === "post" ? item.title : item.slug));
  assert.deepEqual(labels.sort(), ["followers-post", "public-coll"]);
});

test("hasMore is true when the visible union exceeds offset + limit", () => {
  const candidates = Array.from({ length: 5 }, (_, i) =>
    post({ item: { publishedAt: `2026-0${i + 1}-01T00:00:00.000Z`, title: `p${i}` } })
  );
  const first = combineFollowedFeed(candidates, FOLLOWER, 2, 0);
  assert.equal(first.items.length, 2);
  assert.equal(first.hasMore, true);
  const last = combineFollowedFeed(candidates, FOLLOWER, 2, 4);
  assert.equal(last.items.length, 1);
  assert.equal(last.hasMore, false);
});

test("filtered-out rows do not count toward hasMore", () => {
  const page = combineFollowedFeed(
    [
      post({ visibility: "public", item: { title: "a" } }),
      post({ visibility: "private", item: { title: "b" } }),
      post({ visibility: "private", item: { title: "c" } }),
    ],
    FOLLOWER,
    2,
    0
  );
  assert.equal(page.items.length, 1);
  assert.equal(page.hasMore, false);
});
