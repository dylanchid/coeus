import assert from "node:assert/strict";
import test from "node:test";
import { fetchFeedText, isUnsafeIp, UnsafeFeedUrlError } from "./safeFeedFetch.server.ts";
import { fixedAddressLookup, validatedHttpsUrl } from "./safeOutboundFetch.server.ts";

test("rejects private, loopback, link-local, and multicast addresses", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1",
    "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "::", "::1", "fe80::1", "fd00::1",
    "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::7f00:1",
  ]) {
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

test("fixedAddressLookup answers both the legacy and { all: true } call styles", () => {
  const lookup = fixedAddressLookup("8.8.8.8", 4);

  let legacy;
  lookup("example.com", {}, (err, address, family) => { legacy = { err, address, family }; });
  assert.deepEqual(legacy, { err: null, address: "8.8.8.8", family: 4 });

  // Node's autoSelectFamily path — must receive an array of LookupAddress
  let all;
  lookup("example.com", { all: true }, (err, addresses) => { all = { err, addresses }; });
  assert.deepEqual(all, { err: null, addresses: [{ address: "8.8.8.8", family: 4 }] });

  // Three-arg form where the options slot holds the callback
  let noOpts;
  lookup("example.com", (err, address) => { noOpts = { err, address }; });
  assert.deepEqual(noOpts, { err: null, address: "8.8.8.8" });
});

test("the shared outbound primitive rejects a mixed public/private DNS response", async () => {
  const resolve = async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "::ffff:7f00:1", family: 6 },
  ];
  await assert.rejects(validatedHttpsUrl("https://example.com/page", resolve), UnsafeFeedUrlError);
});
