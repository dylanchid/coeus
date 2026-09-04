import assert from "node:assert/strict";
import test from "node:test";
import { fetchFeedText, isUnsafeIp, UnsafeFeedUrlError } from "./safeFeedFetch.server.ts";

test("rejects private, loopback, link-local, and multicast addresses", () => {
  for (const address of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.1.1", "224.0.0.1", "::1", "fe80::1", "fd00::1"]) {
    assert.equal(isUnsafeIp(address), true, address);
  }
  assert.equal(isUnsafeIp("8.8.8.8"), false);
});

test("revalidates redirects before making the redirected request", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    return new Response(null, { status: 302, headers: { location: "https://internal.example/feed.xml" } });
  };
  const resolve = async (hostname) => [{ address: hostname === "public.example" ? "8.8.8.8" : "127.0.0.1" }];
  await assert.rejects(fetchFeedText("https://public.example/feed.xml", fetcher, resolve), UnsafeFeedUrlError);
  assert.deepEqual(calls, ["https://public.example/feed.xml"]);
});

test("normal HTTPS feed responses remain readable", async () => {
  const fetcher = async () => new Response("<rss><channel /></rss>", { status: 200 });
  const resolve = async () => [{ address: "8.8.8.8" }];
  assert.equal(await fetchFeedText("https://example.com/feed.xml", fetcher, resolve), "<rss><channel /></rss>");
});
