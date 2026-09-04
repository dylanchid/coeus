import assert from "node:assert/strict";
import test from "node:test";

import {
  createFeedGetHandler,
  createFeedPostHandler,
  FEED_NO_STORE_CACHE_CONTROL,
  FEED_RESPONSE_CACHE_CONTROL,
} from "./feedApi.ts";

function feed(id, topic) {
  return { id, name: id, topic, articles: [] };
}

function setup(options = {}) {
  const calls = [];
  const dependencies = {
    async fetchFeeds(query) {
      calls.push(query);
      return {
        sources: query.sourceIds.map((id) => feed(id, id === "hn" || id === "my-blog" ? "tech" : "news")),
        updatedAt: "2026-08-05T00:00:00.000Z",
        cache: { hits: 0, misses: query.sourceIds.length, revalidating: 0 },
      };
    },
    consumeRefreshBudget() {
      return options.budget ?? { allowed: true, remaining: 50, retryAfterSeconds: 0 };
    },
  };
  return {
    GET: createFeedGetHandler(dependencies),
    POST: createFeedPostHandler(dependencies),
    calls,
  };
}

function postRequest(body) {
  return new Request("http://test/api/feeds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
  assert.deepEqual(calls[0], { sourceIds: ["hn"], limit: 10, hours: 24, forceRefresh: false, customSources: [] });
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

test("POST handler rejects invalid bodies before publisher work", async () => {
  const { POST, calls } = setup();
  const response = await POST(postRequest({ ids: [] }));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), FEED_NO_STORE_CACHE_CONTROL);
  assert.equal(calls.length, 0);
});

test("POST handler resolves custom sources and is never publicly cacheable, even without a forced refresh", async () => {
  const { POST, calls } = setup();
  const response = await POST(
    postRequest({
      ids: ["my-blog"],
      customSources: [{ id: "my-blog", name: "My Blog", feedUrl: "https://example.com/feed", homeUrl: "https://example.com" }],
    })
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), FEED_NO_STORE_CACHE_CONTROL);
  assert.equal(calls[0].sourceIds[0], "my-blog");
  assert.equal(calls[0].customSources[0].id, "my-blog");
});

test("POST handler re-validates customSources rather than trusting the client", async () => {
  const { POST, calls } = setup();
  const response = await POST(
    postRequest({ ids: ["my-blog"], customSources: [{ id: "my-blog", name: "Blog", feedUrl: "http://insecure.example/feed" }] })
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /Unknown source ids/);
  assert.equal(calls.length, 0);
});
