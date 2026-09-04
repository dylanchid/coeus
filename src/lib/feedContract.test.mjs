import assert from "node:assert/strict";
import test from "node:test";

import { FEED_QUERY_LIMITS, parseFeedBody, parseFeedQuery } from "./feedContract.ts";

function customSource(id) {
  return { id, name: `Custom ${id}`, feedUrl: `https://example.com/${id}`, homeUrl: "https://example.com" };
}

test("feed query deduplicates known source ids across parameters", () => {
  const parsed = parseFeedQuery(new URLSearchParams("ids=hn,bbc,hn&ids=bbc,npr&limit=12&hours=48"));
  assert.deepEqual(parsed, {
    ok: true,
    value: {
      sourceIds: ["hn", "bbc", "npr"],
      limit: 12,
      hours: 48,
      topic: "all",
      forceRefresh: false,
    },
  });
});

test("feed query rejects unknown sources, topics, parameters, and invalid bounds", () => {
  for (const [query, message] of [
    ["ids=hn,missing", "Unknown source ids: missing"],
    ["topic=sports", "Unknown topic: sports"],
    ["limit=0", "limit must be between 1 and 50"],
    ["hours=forever", "hours must be one integer"],
    ["surprise=1", "Unknown query parameter: surprise"],
  ]) {
    assert.deepEqual(parseFeedQuery(new URLSearchParams(query)), { ok: false, error: message });
  }
});

test("feed query rejects oversized requests instead of silently truncating", () => {
  const ids = Array.from({ length: FEED_QUERY_LIMITS.maxSources + 1 }, (_, index) => `source-${index}`);
  const parsed = parseFeedQuery(new URLSearchParams({ ids: ids.join(",") }));
  assert.deepEqual(parsed, { ok: false, error: "ids may contain at most 40 sources" });
});

test("feed query accepts only explicit refresh booleans", () => {
  assert.equal(parseFeedQuery(new URLSearchParams("ids=hn&refresh=true")).ok, true);
  assert.deepEqual(parseFeedQuery(new URLSearchParams("ids=hn&refresh=yes")), {
    ok: false,
    error: "refresh must be 0, 1, false, or true",
  });
});

test("feed body accepts custom sources alongside catalog ids", () => {
  const parsed = parseFeedBody({
    ids: ["hn", "my-blog"],
    customSources: [customSource("my-blog")],
    limit: 12,
    hours: 48,
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.sourceIds, ["hn", "my-blog"]);
  assert.equal(parsed.value.customSources.length, 1);
  assert.equal(parsed.value.limit, 12);
  assert.equal(parsed.value.forceRefresh, false);
});

test("feed body re-validates customSources instead of trusting the client", () => {
  const parsed = parseFeedBody({
    ids: ["my-blog"],
    customSources: [{ id: "my-blog", name: "Blog", feedUrl: "http://example.com/feed" }],
  });
  assert.deepEqual(parsed, { ok: false, error: "Unknown source ids: my-blog" });
});

test("feed body rejects unknown fields, non-object bodies, and malformed ids", () => {
  assert.equal(parseFeedBody(null).ok, false);
  assert.equal(parseFeedBody([]).ok, false);
  assert.deepEqual(parseFeedBody({ ids: ["hn"], surprise: 1 }), {
    ok: false,
    error: "Unknown field: surprise",
  });
  assert.deepEqual(parseFeedBody({ ids: "hn" }), {
    ok: false,
    error: "ids must be an array of strings",
  });
});

test("feed body enforces the same numeric bounds as the query variant", () => {
  assert.deepEqual(parseFeedBody({ ids: ["hn"], limit: 0 }), {
    ok: false,
    error: "limit must be between 1 and 50",
  });
  assert.deepEqual(parseFeedBody({ ids: ["hn"], hours: "24" }), {
    ok: false,
    error: "hours must be an integer",
  });
});
