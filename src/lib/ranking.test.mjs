import assert from "node:assert/strict";
import test from "node:test";
import { parseKeywordRules, rankStories } from "./ranking.ts";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

function article(id, title, options = {}) {
  return {
    id,
    sourceId: options.sourceId ?? "a",
    title,
    url: `https://example.com/${id}`,
    summary: options.summary ?? "",
    author: "",
    publishedAt: options.publishedAt ?? "2026-08-05T12:00:00.000Z",
    ageLabel: "now",
    engagement: options.engagement,
  };
}

function source(id, topic, articles) {
  return { id, name: id.toUpperCase(), topic, articles };
}

test("parses global, phrase, negative, and source-scoped keyword rules", () => {
  const rules = parseKeywordRules(
    'AI +5\n"local-first" +8\ncrypto -4\n@hn Rust +12\ninvalid',
    new Set(["hn"])
  );
  assert.deepEqual(rules, [
    { term: "AI", weight: 5 },
    { term: "local-first", weight: 8 },
    { term: "crypto", weight: -4 },
    { term: "Rust", weight: 10, sourceId: "hn" },
  ]);
});

test("title keyword matches outrank summary-only matches and expose reasons", () => {
  const ranked = rankStories(
    [
      source("a", "tech", [
        article("title", "AI changes software"),
        article("summary", "Software changes", { summary: "An AI report" }),
      ]),
    ],
    [{ term: "AI", weight: 5 }],
    {},
    NOW
  );
  assert.equal(ranked[0].article.id, "title");
  assert.ok(ranked[0].reasons.some((reason) => reason.label === "AI" && reason.points === 20));
  assert.deepEqual(ranked[0].matchedTerms, ["AI"]);
});

test("source preferences boost and deprioritize predictably", () => {
  const ranked = rankStories(
    [
      source("a", "tech", [article("a1", "Neutral", { sourceId: "a" })]),
      source("b", "news", [article("b1", "Favored", { sourceId: "b" })]),
    ],
    [],
    { a: 0.5, b: 1.5 },
    NOW
  );
  assert.equal(ranked[0].sourceId, "b");
  assert.ok(ranked[0].reasons.some((reason) => reason.label === "B preference" && reason.points === 20));
});

test("engagement is normalized within a source", () => {
  const ranked = rankStories(
    [
      source("a", "tech", [
        article("popular", "Popular", { engagement: { points: 100, comments: 30 } }),
        article("quiet", "Quiet", { engagement: { points: 1, comments: 0 } }),
      ]),
    ],
    [],
    {},
    NOW
  );
  const popular = ranked.find((story) => story.article.id === "popular");
  assert.ok(popular?.reasons.some((reason) => reason.label === "engagement" && reason.points === 10));
});

test("diversity prevents consecutive ties from the same source", () => {
  const ranked = rankStories(
    [
      source("a", "tech", [article("a1", "One"), article("a2", "Two")]),
      source("b", "news", [article("b1", "Three", { sourceId: "b" })]),
    ],
    [],
    {},
    NOW
  );
  assert.deepEqual(ranked.slice(0, 2).map((story) => story.sourceId), ["a", "b"]);
});
