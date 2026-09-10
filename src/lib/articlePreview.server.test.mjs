import assert from "node:assert/strict";
import test from "node:test";

import {
  isPreviewOptedOut,
  pageAppearsAccessRestricted,
  pageDisallowsPreview,
  prepareStaticPreviewHtml,
  robotsAllowsUrl,
} from "./articlePreviewPolicy.ts";

test("preview domain opt-out covers the named domain and its subdomains only", () => {
  const optedOut = ["publisher.example", ".blocked.example"];
  assert.equal(isPreviewOptedOut("publisher.example", optedOut), true);
  assert.equal(isPreviewOptedOut("cdn.publisher.example", optedOut), true);
  assert.equal(isPreviewOptedOut("notpublisher.example", optedOut), false);
  assert.equal(isPreviewOptedOut("blocked.example", optedOut), true);
});

test("static preview markup removes complete script blocks rather than displaying their text", () => {
  const prepared = prepareStaticPreviewHtml('<script>window.snowplowQueue = ["analytics configuration"];</script><article><h1>The real article title</h1></article>', "https://example.com/story");
  assert.doesNotMatch(prepared, /snowplow|analytics configuration/i);
  assert.match(prepared, /The real article title/);
});

test("static preview retains stylesheet links in its controlled document head", () => {
  const prepared = prepareStaticPreviewHtml('<link rel="stylesheet" href="/assets/article.css"><article>Story</article>', "https://example.com/article");
  assert.match(prepared, /<base href="https:\/\/example\.com\/article">/);
  assert.match(prepared, /<link rel="stylesheet" href="\/assets\/article\.css">/);
});

test("robots rules block CoeusPreview and allow a more-specific exception", () => {
  const robots = `User-agent: CoeusPreview\nDisallow: /\nAllow: /press/\n\nUser-agent: *\nAllow: /`;
  assert.equal(robotsAllowsUrl(robots, new URL("https://example.com/story")), false);
  assert.equal(robotsAllowsUrl(robots, new URL("https://example.com/press/release")), true);
  assert.equal(robotsAllowsUrl("User-agent: *\nDisallow: /private", new URL("https://example.com/public")), true);
});

test("explicit source directives disable static previews", () => {
  assert.equal(pageDisallowsPreview("<meta name=\"robots\" content=\"noimageindex\">", new Headers()), true);
  assert.equal(pageDisallowsPreview("<meta name=\"coeus-preview\" content=\"no-preview\">", new Headers()), true);
  assert.equal(pageDisallowsPreview("<html><head></head></html>", new Headers({ "X-Robots-Tag": "noarchive" })), true);
  assert.equal(pageDisallowsPreview("<meta name=\"robots\" content=\"index, follow\">", new Headers()), false);
  assert.equal(pageDisallowsPreview("<meta content=\"no-preview\" name=\"coeus-preview\">", new Headers()), true);
  assert.equal(pageAppearsAccessRestricted('<meta itemprop="isAccessibleForFree" content="false">', new Headers()), true);
  assert.equal(pageAppearsAccessRestricted("<html></html>", new Headers({ "WWW-Authenticate": "Bearer" })), true);
});
