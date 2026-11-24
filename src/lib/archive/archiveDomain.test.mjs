import assert from "node:assert/strict";
import test from "node:test";

import { addItemsToCollection, addLinksToCollection, archiveArticle } from "./archiveDomain.ts";

const data = { version: 1, items: [], collections: [], socialPosts: [] };
const article = {
  id: "story-1", sourceId: "source-1", title: "Machine learning maps climate emissions",
  url: "https://example.com/story", summary: "Scientists use machine learning to study emissions.",
  author: "", publishedAt: null, ageLabel: "now",
};

test("saving a story applies bounded local topic and keyword tags for Archive search", () => {
  const saved = archiveArticle(data, article, "Example", "science", new Date("2026-09-10T00:00:00.000Z"));
  assert.deepEqual(saved.items[0].tags.slice(0, 3), ["science", "ai", "climate"]);
  assert.ok(saved.items[0].tags.includes("machine"));
});

const seeded = {
  version: 1,
  items: [
    {
      id: "item-1",
      articleId: "a-1",
      title: "One",
      url: "https://example.com/one",
      sourceName: "Ex",
      topic: "all",
      summary: "",
      author: "",
      publishedAt: null,
      savedAt: "2026-01-01T00:00:00.000Z",
      state: "unread",
      starred: false,
      collectionIds: ["inbox", "alpha"],
      tags: [],
      note: "",
    },
    {
      id: "item-2",
      articleId: "a-2",
      title: "Two",
      url: "https://example.com/two",
      sourceName: "Ex",
      topic: "all",
      summary: "",
      author: "",
      publishedAt: null,
      savedAt: "2026-01-02T00:00:00.000Z",
      state: "unread",
      starred: false,
      collectionIds: ["beta"],
      tags: [],
      note: "",
    },
  ],
  collections: [],
  socialPosts: [],
};

test("addItemsToCollection appends membership without removing existing collections", () => {
  const next = addItemsToCollection(seeded, ["item-1", "item-2"], "reading");
  assert.deepEqual(next.items[0].collectionIds, ["inbox", "alpha", "reading"]);
  assert.deepEqual(next.items[1].collectionIds, ["beta", "reading"]);
});

test("addLinksToCollection reuses an existing saved item for the same URL", () => {
  const now = new Date("2026-11-24T00:00:00.000Z");
  const next = addLinksToCollection(
    seeded,
  [
      { url: "https://example.com/one", title: "Dup", sourceName: "X", author: "", excerpt: "", ok: true },
      { url: "https://example.com/three", title: "Three", sourceName: "Ex", author: "", excerpt: "", ok: true },
    ],
    "gamma",
    now,
  );
  assert.equal(next.items.length, 3);
  const one = next.items.find((item) => item.url === "https://example.com/one");
  assert.deepEqual(one.collectionIds, ["inbox", "alpha", "gamma"]);
  const three = next.items.find((item) => item.url === "https://example.com/three");
  assert.ok(three);
  assert.deepEqual(three.collectionIds, ["gamma"]);
});
