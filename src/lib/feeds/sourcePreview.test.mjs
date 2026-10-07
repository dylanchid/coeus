import assert from "node:assert/strict";
import test from "node:test";

import { buildSourcePreview } from "./sourcePreview.ts";

test("builds a preview from feed metadata, deriving a slug id from the title", () => {
  const preview = buildSourcePreview(
    { title: "My Great Blog", description: "Thoughts, mostly", link: "/about", items: [{}, {}] },
    "https://example.substack.com/feed"
  );
  assert.equal(preview.id, "my-great-blog");
  assert.equal(preview.name, "My Great Blog");
  assert.equal(preview.feedUrl, "https://example.substack.com/feed");
  assert.equal(preview.homeUrl, "https://example.substack.com/about");
  assert.equal(preview.description, "Thoughts, mostly");
  assert.equal(preview.itemCount, 2);
});

test("falls back to the feed's hostname when a title is missing", () => {
  const preview = buildSourcePreview({ items: [] }, "https://example.substack.com/feed");
  assert.equal(preview.name, "example.substack.com");
  assert.equal(preview.homeUrl, "https://example.substack.com");
  assert.equal(preview.itemCount, 0);
});

test("truncates an overlong description", () => {
  const preview = buildSourcePreview(
    { title: "Long", description: "x".repeat(500), items: [{}] },
    "https://example.com/feed"
  );
  assert.equal(preview.description.length, 280);
});
