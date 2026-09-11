import assert from "node:assert/strict";
import test from "node:test";

import { signPreviewImageUrl, verifyPreviewImageUrl } from "./imageProxySignature.server.ts";

const SECRET = "test-image-proxy-secret";
const REMOTE = "https://publisher.example/og.png";

test("a signature minted for a URL verifies for that same URL", () => {
  const now = Date.now();
  const { expires, signature } = signPreviewImageUrl(REMOTE, SECRET, now);
  assert.equal(verifyPreviewImageUrl(REMOTE, expires, signature, SECRET, now), true);
});

test("a signature does not verify for a different URL", () => {
  const now = Date.now();
  const { expires, signature } = signPreviewImageUrl(REMOTE, SECRET, now);
  assert.equal(verifyPreviewImageUrl("https://evil.example/steal", expires, signature, SECRET, now), false);
});

test("a signature signed with a different secret is rejected", () => {
  const now = Date.now();
  const { expires, signature } = signPreviewImageUrl(REMOTE, SECRET, now);
  assert.equal(verifyPreviewImageUrl(REMOTE, expires, signature, "wrong-secret", now), false);
});

test("an expired signature is rejected", () => {
  const now = Date.now();
  const { expires, signature } = signPreviewImageUrl(REMOTE, SECRET, now);
  assert.equal(verifyPreviewImageUrl(REMOTE, expires, signature, SECRET, expires + 1), false);
});

test("a forged expiry is rejected even with a well-formed signature for that expiry", () => {
  const now = Date.now();
  const { expires, signature } = signPreviewImageUrl(REMOTE, SECRET, now);
  assert.equal(verifyPreviewImageUrl(REMOTE, expires + 10_000, signature, SECRET, now), false);
});

test("a malformed signature is rejected without throwing", () => {
  const now = Date.now();
  const { expires } = signPreviewImageUrl(REMOTE, SECRET, now);
  assert.equal(verifyPreviewImageUrl(REMOTE, expires, "not-base64url!!", SECRET, now), false);
});

test("a non-finite expiry is rejected", () => {
  assert.equal(verifyPreviewImageUrl(REMOTE, Number.NaN, "anything", SECRET), false);
});
