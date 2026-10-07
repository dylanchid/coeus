import assert from "node:assert/strict";
import test from "node:test";

import { inferArticleIndex } from "./articleIndex.ts";

test("keeps publisher labels separate while deriving bounded local topics and terms", () => {
  const index = inferArticleIndex({
    title: "How machine learning changes climate research",
    description: "Scientists use machine learning to model emissions.",
    publisherTags: ["Research", "Climate", "Research"],
    sourceTopic: "science",
  });
  assert.deepEqual(index.publisherTags, ["research", "climate"]);
  assert.deepEqual(index.topics, ["science", "ai", "climate"]);
  assert.ok(index.keywords.includes("machine"));
  assert.ok(index.keywords.length <= 5);
});

test("does not turn common connective words into archive tags", () => {
  const index = inferArticleIndex({ title: "What this article is about", description: "This is another story about the same thing." });
  assert.deepEqual(index.keywords, []);
});

test("rejects publishing-state and workflow terms even when they dominate the headline", () => {
  const index = inferArticleIndex({
    title: "Released: the stack is continuing",
    description: "The release continues with another stack update.",
    sourceTopic: "tech",
  });
  assert.deepEqual(index.topics, ["tech"]);
  assert.deepEqual(index.keywords, []);
});

test("prefers a title-case name and a term supported by title and description", () => {
  const index = inferArticleIndex({
    title: "OpenAI studies ocean currents",
    description: "The OpenAI team built an ocean model for currents.",
  });
  assert.ok(index.keywords.includes("openai"));
  assert.ok(index.keywords.includes("ocean"));
});
