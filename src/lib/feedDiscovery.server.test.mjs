import assert from "node:assert/strict";
import test from "node:test";

import { resolveFeedUrl } from "./feedDiscovery.server.ts";

const PUBLIC_RESOLVE = async () => [{ address: "8.8.8.8" }];

function rss(itemCount = 1) {
  const items = Array.from({ length: itemCount }, (_, i) => `<item><title>Item ${i}</title><link>https://example.com/${i}</link></item>`).join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Test Blog</title><link>https://example.com</link>${items}</channel></rss>`;
}

function html(headExtra = "") {
  return `<html><head>${headExtra}</head><body>Hello</body></html>`;
}

function fetcherFromMap(map) {
  return async (url) => {
    const key = String(url);
    const body = map[key];
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(body, { status: 200 });
  };
}

test("resolves a direct feed URL without trying other tiers", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    return new Response(rss(2), { status: 200 });
  };
  const result = await resolveFeedUrl("https://example.substack.com/feed", fetcher, PUBLIC_RESOLVE);
  assert.equal(result.ok, true);
  assert.equal(result.feedUrl, "https://example.substack.com/feed");
  assert.equal(result.feed.items.length, 2);
  assert.deepEqual(calls, ["https://example.substack.com/feed"]);
});

test("falls back to the Substack /feed convention when the pasted URL is a homepage", async () => {
  const calls = [];
  const mappedFetcher = fetcherFromMap({
    "https://example.substack.com/": html(),
    "https://example.substack.com/feed": rss(3),
  });
  const fetcher = async (...args) => {
    calls.push(String(args[0]));
    return mappedFetcher(...args);
  };
  const result = await resolveFeedUrl("https://example.substack.com/", fetcher, PUBLIC_RESOLVE);
  assert.equal(result.ok, true);
  assert.equal(result.feedUrl, "https://example.substack.com/feed");
  assert.equal(result.feed.items.length, 3);
  assert.deepEqual(calls, ["https://example.substack.com/feed"]);
});

test("falls back to Substack HTML autodiscovery when its conventional feed is unavailable", async () => {
  const fetcher = fetcherFromMap({
    "https://example.substack.com/": html(
      '<link rel="alternate" type="application/rss+xml" href="/rss.xml">'
    ),
    "https://example.substack.com/rss.xml": rss(1),
  });
  const result = await resolveFeedUrl("https://example.substack.com/", fetcher, PUBLIC_RESOLVE);
  assert.equal(result.ok, true);
  assert.equal(result.feedUrl, "https://example.substack.com/rss.xml");
});

test("falls back to HTML autodiscovery when the /feed convention also fails", async () => {
  const fetcher = fetcherFromMap({
    "https://blog.example.com/": html(
      '<link rel="alternate" type="application/rss+xml" href="/index.xml">'
    ),
    "https://blog.example.com/index.xml": rss(1),
  });
  const result = await resolveFeedUrl("https://blog.example.com/", fetcher, PUBLIC_RESOLVE);
  assert.equal(result.ok, true);
  assert.equal(result.feedUrl, "https://blog.example.com/index.xml");
});

test("returns a clear error when no tier resolves to a feed", async () => {
  const fetcher = fetcherFromMap({
    "https://blog.example.com/": html(),
  });
  const result = await resolveFeedUrl("https://blog.example.com/", fetcher, PUBLIC_RESOLVE);
  assert.equal(result.ok, false);
  assert.match(result.error, /couldn't find a feed/i);
});

test("rejects an invalid URL before making any request", async () => {
  const fetcher = async () => {
    throw new Error("should not be called");
  };
  const result = await resolveFeedUrl("not a url", fetcher, PUBLIC_RESOLVE);
  assert.equal(result.ok, false);
  assert.match(result.error, /valid url/i);
});

test("stops immediately when the pasted URL resolves to an unsafe address", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    return new Response(html(), { status: 200 });
  };
  const resolve = async () => [{ address: "127.0.0.1" }];
  const result = await resolveFeedUrl("https://internal.example/", fetcher, resolve);
  assert.equal(result.ok, false);
  assert.deepEqual(calls, []);
});
