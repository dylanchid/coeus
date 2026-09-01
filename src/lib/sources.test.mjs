import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ENABLED_SOURCE_IDS,
  SOURCE_CATALOG,
  catalogSourceIds,
  defaultSourceOrder,
  storedSourceOrder,
} from "./sources.ts";

test("catalog ids are unique and every source has discovery metadata", () => {
  const ids = catalogSourceIds();
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SOURCE_CATALOG.length >= 50);
  for (const source of SOURCE_CATALOG) {
    assert.ok(source.name && source.homeUrl && source.feedUrl && source.description);
    assert.ok(source.topics.length > 0);
    assert.ok(source.tags.length > 0);
  }
});

test("catalog expansion does not silently enable new sources", () => {
  assert.deepEqual(defaultSourceOrder(), [...DEFAULT_ENABLED_SOURCE_IDS]);
  assert.ok(SOURCE_CATALOG.length > DEFAULT_ENABLED_SOURCE_IDS.length);
  assert.equal(defaultSourceOrder().includes("nasa"), false);
});

test("an explicitly stored enabled set preserves removals", () => {
  assert.deepEqual(storedSourceOrder(["hn", "nasa", "unknown", "hn"]), ["hn", "nasa"]);
  assert.deepEqual(storedSourceOrder([]), []);
  assert.equal(storedSourceOrder(undefined), null);
});
