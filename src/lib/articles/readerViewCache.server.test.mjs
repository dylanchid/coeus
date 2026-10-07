import assert from "node:assert/strict";
import test from "node:test";

import { readerViewCachePath, readerViewCachePathBelongsToDomain } from "./readerViewCache.server.ts";

test("reader view cache paths are private, stable, and do not expose source URLs", () => {
  const first = readerViewCachePath("https://publisher.example/article?private=token");
  assert.match(first, /^coeus-reader-view\/v1\/publisher\.example\/[a-f0-9]{64}\.json$/);
  assert.equal(first, readerViewCachePath("https://publisher.example/article?private=token"));
  assert.notEqual(first, readerViewCachePath("https://publisher.example/other"));
  assert.doesNotMatch(first, /token|article/);
});

test("domain purge includes subdomains but not lookalikes", () => {
  assert.equal(readerViewCachePathBelongsToDomain("coeus-reader-view/v1/publisher.example/a.json", "publisher.example"), true);
  assert.equal(readerViewCachePathBelongsToDomain("coeus-reader-view/v1/www.publisher.example/a.json", "publisher.example"), true);
  assert.equal(readerViewCachePathBelongsToDomain("coeus-reader-view/v1/notpublisher.example/a.json", "publisher.example"), false);
});

test("reader view cache refuses non-HTTPS and invalid URLs", () => {
  assert.equal(readerViewCachePath("http://publisher.example/article"), null);
  assert.equal(readerViewCachePath("not a url"), null);
});
