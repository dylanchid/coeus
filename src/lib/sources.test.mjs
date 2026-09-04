import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ENABLED_SOURCE_IDS,
  SOURCE_CATALOG,
  catalogSourceIds,
  defaultSourceOrder,
  storedSourceOrder,
  getSource,
  sourceByIdMap,
  sanitizeCustomSources,
  slugifyId,
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

test("custom sources participate in source resolution without shadowing built-ins", () => {
  const custom = { id: "custom-example", name: "Example", feedUrl: "https://example.com/feed.xml", homeUrl: "https://example.com", topic: "tech", topics: [], tags: ["custom"], description: "", language: "English", region: "Global", sourceType: "publisher", cadence: "daily", depth: "mixed", defaultRank: 50 };
  assert.equal(getSource(custom.id, [custom]), custom);
  assert.equal(sourceByIdMap([custom]).get(custom.id), custom);
  assert.equal(getSource("hn", [custom])?.name, "Hacker News");
  assert.deepEqual(storedSourceOrder(["custom-example", "hn", "missing"], [custom]), ["custom-example", "hn"]);
});

test("slugifyId produces non-empty, url-safe ids", () => {
  assert.equal(slugifyId("My Great Blog!"), "my-great-blog");
  assert.equal(slugifyId("   "), "custom-source");
  assert.match(slugifyId("Ünïcödé Ñame"), /^[a-z0-9-]+$/);
  assert.equal(slugifyId("a".repeat(100)).length, 60);
});

test("sanitizeCustomSources rejects non-https urls, built-in id collisions, and duplicates", () => {
  const valid = { id: "my-blog", name: "My Blog", feedUrl: "https://example.com/feed", homeUrl: "https://example.com" };
  const insecure = { id: "insecure", name: "Insecure", feedUrl: "http://example.com/feed" };
  const collidesWithCatalog = { id: "hn", name: "Fake HN", feedUrl: "https://example.com/fake" };
  const missingFields = { id: "no-name", feedUrl: "https://example.com/feed" };

  const result = sanitizeCustomSources([valid, insecure, collidesWithCatalog, missingFields, valid]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "my-blog");
  assert.equal(result[0].topic, "all");
  assert.deepEqual(result[0].tags, ["custom"]);
});

test("sanitizeCustomSources ignores non-array input and caps the list at 100", () => {
  assert.deepEqual(sanitizeCustomSources(null), []);
  assert.deepEqual(sanitizeCustomSources("nope"), []);
  const many = Array.from({ length: 150 }, (_, i) => ({
    id: `source-${i}`,
    name: `Source ${i}`,
    feedUrl: `https://example.com/${i}`,
  }));
  assert.equal(sanitizeCustomSources(many).length, 100);
});
