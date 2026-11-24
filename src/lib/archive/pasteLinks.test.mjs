import assert from "node:assert/strict";
import test from "node:test";

import { parsePastedLinks, PASTE_LINKS_CAP, resolvedLinkToItem } from "./pasteLinks.ts";

test("parsePastedLinks accepts http and https, trims, de-dupes, and counts rejects", () => {
  const text = [
    "  https://a.example/1  ",
    "http://b.example/2",
    "https://a.example/1",
    "ftp://bad.test/x",
    "",
    "https://c.example/3",
  ].join("\n");
  const parsed = parsePastedLinks(text);
  assert.deepEqual(parsed.links, ["https://a.example/1", "http://b.example/2", "https://c.example/3"]);
  assert.equal(parsed.duplicatesSkipped, 1);
  assert.equal(parsed.notWebLink, 1);
  assert.equal(parsed.capped, false);
});

test("parsePastedLinks keeps only the first fifty unique links", () => {
  const lines = Array.from({ length: 60 }, (_, index) => `https://example.com/${index}`);
  const parsed = parsePastedLinks(lines.join("\n"));
  assert.equal(parsed.links.length, PASTE_LINKS_CAP);
  assert.equal(parsed.capped, true);
  assert.equal(parsed.links[0], "https://example.com/0");
  assert.equal(parsed.links[PASTE_LINKS_CAP - 1], "https://example.com/49");
});

test("resolvedLinkToItem uses resolver fields with link article id", () => {
  const now = new Date("2026-11-24T12:00:00.000Z");
  const item = resolvedLinkToItem(
    { url: "https://news.example/story", title: "A headline", sourceName: "News", author: "Alex", excerpt: "Lead", ok: true },
    "reading-list",
    now,
  );
  assert.match(item.id, /^saved-/);
  assert.equal(item.articleId, "https://news.example/story".replace(/^/, "link:"));
  assert.equal(item.articleId, "link:https://news.example/story");
  assert.equal(item.title, "A headline");
  assert.equal(item.sourceName, "News");
  assert.deepEqual(item.collectionIds, ["reading-list"]);
  assert.equal(item.topic, "all");
  assert.equal(item.state, "unread");
  assert.deepEqual(item.tags, []);
});