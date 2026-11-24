import assert from "node:assert/strict";
import test from "node:test";

import {
  addFollowedCollectionToPrefs,
  buildCollectionSourceDef,
  collectionSourceId,
  mergeFollowedCollections,
  parseCollectionSourceId,
  removeFollowedCollectionFromPrefs,
} from "./collectionSource.ts";
import { defaultSourceOrder, sanitizeCustomSources } from "./sources.ts";

const DEFAULT_PREFS = {
  version: 1,
  customSources: [],
  sourceOrder: defaultSourceOrder(),
  hiddenSources: [],
  theme: "system",
  limit: 10,
  hours: 24,
  lastSearch: "",
  showSummaries: false,
  showAuthors: false,
  showAges: true,
  showEngagement: true,
  columns: 3,
  homeView: "grid",
  storyRepresentation: "detailed",
  articlePreviewMode: "ask",
  font: "mono",
  palette: "ink",
  density: "comfortable",
  keywordRules: [],
  sourceWeights: {},
  sourceRatings: {},
};

test("collection source id round-trips valid slugs", () => {
  const slug = "field-notes";
  assert.equal(collectionSourceId(slug), "c:field-notes");
  assert.equal(parseCollectionSourceId("c:field-notes"), slug);
  assert.equal(parseCollectionSourceId("c:Bad Slug"), null);
});

test("buildCollectionSourceDef wires coeus URLs and tags", () => {
  const def = buildCollectionSourceDef({ slug: "field-notes", name: "Field Notes", curatorHandle: "ada" });
  assert.equal(def.id, "c:field-notes");
  assert.equal(def.name, "Field Notes · @ada");
  assert.equal(def.feedUrl, "/c/field-notes/rss.xml");
  assert.equal(def.homeUrl, "/c/field-notes");
  assert.deepEqual(def.tags, ["coeus-collection"]);
  assert.equal(def.topic, "all");
});

test("add and remove followed collection sources are idempotent on prefs", () => {
  const once = addFollowedCollectionToPrefs(DEFAULT_PREFS, { slug: "a", name: "A" });
  const twice = addFollowedCollectionToPrefs(once, { slug: "a", name: "A" });
  assert.equal(twice.customSources.filter((s) => s.id === "c:a").length, 1);
  assert.ok(twice.sourceOrder.includes("c:a"));

  const removed = removeFollowedCollectionFromPrefs(twice, "a");
  assert.equal(removed.customSources.some((s) => s.id === "c:a"), false);
  assert.equal(removed.sourceOrder.includes("c:a"), false);
});

test("sanitizeCustomSources accepts c: ids and rewrites urls", () => {
  const result = sanitizeCustomSources([
    {
      id: "c:field-notes",
      name: "Field Notes · @ada",
      feedUrl: "https://evil.example/feed",
      homeUrl: "https://evil.example",
    },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].feedUrl, "/c/field-notes/rss.xml");
  assert.equal(result[0].homeUrl, "/c/field-notes");
});

test("sanitizeCustomSources rejects bad collection slugs", () => {
  assert.deepEqual(sanitizeCustomSources([{ id: "c:", name: "X", feedUrl: "/x" }]), []);
  assert.deepEqual(sanitizeCustomSources([{ id: "c:!!", name: "X", feedUrl: "/x" }]), []);
});

test("mergeFollowedCollections adds, refreshes, and prunes collection sources only", () => {
  const seeded = addFollowedCollectionToPrefs(
    {
      ...DEFAULT_PREFS,
      customSources: [
        ...DEFAULT_PREFS.customSources,
        {
          id: "custom-blog",
          name: "Blog",
          feedUrl: "https://example.com/feed",
          homeUrl: "https://example.com",
          topic: "all",
          topics: [],
          tags: ["custom"],
          description: "",
          language: "English",
          region: "Global",
          sourceType: "publisher",
          cadence: "daily",
          depth: "mixed",
          defaultRank: 50,
        },
      ],
    },
    { slug: "stale", name: "Stale" }
  );

  const merged = mergeFollowedCollections(seeded, [
    { id: "p1", slug: "fresh", name: "Fresh", curatorHandle: "ada" },
  ]);
  assert.ok(merged.customSources.some((s) => s.id === "custom-blog"));
  assert.equal(merged.customSources.some((s) => s.id === "c:stale"), false);
  assert.ok(merged.customSources.some((s) => s.id === "c:fresh"));
  assert.ok(merged.sourceOrder.includes("c:fresh"));
});