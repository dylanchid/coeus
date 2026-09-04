import assert from "node:assert/strict";
import test from "node:test";

import { findFeedLink } from "./feedDiscovery.ts";

test("finds a WordPress-style RSS autodiscovery link with a relative href", () => {
  const html = `
    <html><head>
      <title>Example Blog</title>
      <link rel="alternate" type="application/rss+xml" title="Example Blog Feed" href="/feed/" />
    </head><body></body></html>
  `;
  assert.equal(findFeedLink(html, "https://example.com/blog/"), "https://example.com/feed/");
});

test("finds a Ghost-style Atom autodiscovery link with an absolute href", () => {
  const html = `<link rel="alternate" type="application/atom+xml" href="https://example.com/rss/">`;
  assert.equal(findFeedLink(html, "https://example.com/"), "https://example.com/rss/");
});

test("handles single-quoted attributes and unordered rel/type/href", () => {
  const html = `<link href='/atom.xml' type='application/atom+xml' rel='alternate'>`;
  assert.equal(findFeedLink(html, "https://example.com/"), "https://example.com/atom.xml");
});

test("ignores link tags that are not alternate feeds", () => {
  const html = `
    <link rel="stylesheet" href="/style.css">
    <link rel="alternate" type="application/json+oembed" href="/oembed">
    <link rel="canonical" href="/">
  `;
  assert.equal(findFeedLink(html, "https://example.com/"), null);
});

test("returns null when there is no matching link", () => {
  assert.equal(findFeedLink("<html><head></head><body></body></html>", "https://example.com/"), null);
});

test("picks the first matching feed link when multiple are present", () => {
  const html = `
    <link rel="alternate" type="application/rss+xml" href="/feed/rss">
    <link rel="alternate" type="application/atom+xml" href="/feed/atom">
  `;
  assert.equal(findFeedLink(html, "https://example.com/"), "https://example.com/feed/rss");
});
