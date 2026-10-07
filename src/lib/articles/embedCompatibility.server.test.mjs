import assert from "node:assert/strict";
import test from "node:test";

import {
  compatibilityFromHeaders,
  inspectEmbedCompatibility,
} from "./embedCompatibility.server.ts";

test("embed compatibility respects X-Frame-Options and frame-ancestors", () => {
  assert.equal(compatibilityFromHeaders(new Headers()), "allowed");
  assert.equal(compatibilityFromHeaders(new Headers({ "x-frame-options": "SAMEORIGIN" })), "blocked");
  assert.equal(compatibilityFromHeaders(new Headers({ "x-frame-options": "DENY" })), "blocked");
  assert.equal(compatibilityFromHeaders(new Headers({ "content-security-policy": "default-src 'self'; frame-ancestors 'self'" })), "blocked");
  assert.equal(compatibilityFromHeaders(new Headers({ "content-security-policy": "frame-ancestors https:" })), "allowed");
});

test("embed audit revalidates redirects and does not follow a private target", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    return new Response(null, { status: 302, headers: { location: "https://internal.example/article" } });
  };
  const resolve = async (hostname) => [{ address: hostname === "public.example" ? "8.8.8.8" : "127.0.0.1", family: 4 }];
  assert.equal(await inspectEmbedCompatibility("https://public.example/article", { fetcher, resolve }), "unknown");
  assert.deepEqual(calls, ["https://public.example/article"]);
});

test("embed audit reports a non-success response as unknown", async () => {
  const fetcher = async () => new Response(null, { status: 403 });
  const resolve = async () => [{ address: "8.8.8.8", family: 4 }];
  assert.equal(await inspectEmbedCompatibility("https://public.example/article", { fetcher, resolve }), "unknown");
});

test("embed audit probes with GET so per-method framing headers are seen", async () => {
  let method;
  const fetcher = async (_url, init) => {
    method = init.method;
    return new Response(null, { status: 200, headers: { "x-frame-options": "DENY" } });
  };
  const resolve = async () => [{ address: "8.8.8.8", family: 4 }];
  assert.equal(await inspectEmbedCompatibility("https://public.example/article", { fetcher, resolve }), "blocked");
  assert.equal(method, "GET");
});
