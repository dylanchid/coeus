import assert from "node:assert/strict";
import test from "node:test";

import { BoundedCache, feedCacheKey } from "./feedCache.ts";

test("custom feeds with a shared local id retain distinct cache identities", () => {
  const first = feedCacheKey({ id: "my-blog", feedUrl: "https://first.example/feed.xml" });
  const second = feedCacheKey({ id: "my-blog", feedUrl: "https://second.example/feed.xml" });
  const cache = new BoundedCache(2);
  cache.set(first, "first visitor's feed");
  cache.set(second, "second visitor's feed");

  assert.notEqual(first, second);
  assert.equal(cache.get(first), "first visitor's feed");
  assert.equal(cache.get(second), "second visitor's feed");
});

test("bounded cache evicts the least recently used feed and retains recently read data", () => {
  const cache = new BoundedCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);

  assert.equal(cache.size, 2);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), 3);
});
