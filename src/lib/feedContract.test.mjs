import assert from "node:assert/strict";
import test from "node:test";

import { FEED_QUERY_LIMITS, parseFeedQuery } from "./feedContract.ts";

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
