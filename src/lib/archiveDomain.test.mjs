import assert from "node:assert/strict";
import test from "node:test";

import { archiveArticle } from "./archiveDomain.ts";

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
