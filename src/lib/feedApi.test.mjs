import assert from "node:assert/strict";
import test from "node:test";

import {
  createFeedGetHandler,
  FEED_NO_STORE_CACHE_CONTROL,
  FEED_RESPONSE_CACHE_CONTROL,
} from "./feedApi.ts";

function feed(id, topic) {
  return { id, name: id, topic, articles: [] };
}

function setup(options = {}) {
  const calls = [];
  const GET = createFeedGetHandler({
    async fetchFeeds(query) {
      calls.push(query);
      return {
        sources: query.sourceIds.map((id) => feed(id, id === "hn" ? "tech" : "news")),
        updatedAt: "2026-08-05T00:00:00.000Z",
        cache: { hits: 0, misses: query.sourceIds.length, revalidating: 0 },
      };
    },
    consumeRefreshBudget() {
      return options.budget ?? { allowed: true, remaining: 50, retryAfterSeconds: 0 };
    },
  });
  return { GET, calls };
}

test("feed handler rejects invalid input before publisher work", async () => {
  const { GET, calls } = setup();
  const response = await GET(new Request("http://test/api/feeds?ids=unknown"));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), FEED_NO_STORE_CACHE_CONTROL);
  assert.equal(calls.length, 0);
});

test("feed handler filters by topic before fetching and exposes public cache semantics", async () => {
  const { GET, calls } = setup();
  const response = await GET(new Request("http://test/api/feeds?ids=hn,bbc&topic=tech"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), FEED_RESPONSE_CACHE_CONTROL);
  assert.deepEqual(calls[0], { sourceIds: ["hn"], limit: 10, hours: 24, forceRefresh: false });
});

test("forced refreshes are no-store and consume the refresh budget", async () => {
  const { GET, calls } = setup();
  const response = await GET(new Request("http://test/api/feeds?ids=hn,bbc&refresh=1"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), FEED_NO_STORE_CACHE_CONTROL);
  assert.equal(response.headers.get("x-ratelimit-remaining"), "50");
  assert.equal(calls[0].forceRefresh, true);
});

test("rate-limited refreshes never fan out to publishers", async () => {
  const { GET, calls } = setup({
    budget: { allowed: false, remaining: 0, retryAfterSeconds: 37 },
  });
  const response = await GET(new Request("http://test/api/feeds?ids=hn&refresh=1"));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "37");
  assert.equal(response.headers.get("cache-control"), FEED_NO_STORE_CACHE_CONTROL);
  assert.equal(calls.length, 0);
});
