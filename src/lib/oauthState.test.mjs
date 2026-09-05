import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthStateNonce, signOAuthState, verifyOAuthState } from "./oauthState.server.ts";

const SECRET = "test-oauth-state-secret";

test("sign/verify round-trips a payload", () => {
  const payload = { archiveId: "archive-1", nonce: createOAuthStateNonce(), issuedAt: Date.now() };
  const token = signOAuthState(payload, SECRET);
  const result = verifyOAuthState(token, SECRET);
  assert.deepEqual(result, { ok: true, value: payload });
});

test("a malformed token is rejected", () => {
  assert.equal(verifyOAuthState("not-a-token", SECRET).ok, false);
  assert.equal(verifyOAuthState("a.b.c", SECRET).ok, false);
});

test("a token signed with a different secret is rejected", () => {
  const token = signOAuthState({ archiveId: "archive-1", nonce: "n", issuedAt: Date.now() }, SECRET);
  const result = verifyOAuthState(token, "wrong-secret");
  assert.equal(result.ok, false);
  assert.equal(result.error, "OAuth state signature mismatch");
});

test("a tampered payload is rejected even if the signature still parses", () => {
  const token = signOAuthState({ archiveId: "archive-1", nonce: "n", issuedAt: Date.now() }, SECRET);
  const [, signature] = token.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ archiveId: "someone-elses-archive", nonce: "n", issuedAt: Date.now() }), "utf8").toString("base64url");
  assert.equal(verifyOAuthState(`${forgedBody}.${signature}`, SECRET).ok, false);
});

test("an expired token is rejected", () => {
  const issuedAt = Date.now() - 11 * 60 * 1000;
  const token = signOAuthState({ archiveId: "archive-1", nonce: "n", issuedAt }, SECRET);
  const result = verifyOAuthState(token, SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.error, "OAuth state has expired");
});

test("a token issued too far in the future is rejected", () => {
  const issuedAt = Date.now() + 5 * 60 * 1000;
  const token = signOAuthState({ archiveId: "archive-1", nonce: "n", issuedAt }, SECRET);
  assert.equal(verifyOAuthState(token, SECRET).ok, false);
});

test("createOAuthStateNonce produces distinct values", () => {
  assert.notEqual(createOAuthStateNonce(), createOAuthStateNonce());
});
