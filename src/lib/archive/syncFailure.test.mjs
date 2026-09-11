import assert from "node:assert/strict";
import test from "node:test";

import { backoffMs, classifyStatus, isPermanent } from "./syncFailure.ts";

test("classifyStatus separates auth, validation, and retryable", () => {
  assert.equal(classifyStatus(401), "auth");
  assert.equal(classifyStatus(403), "auth");

  for (const status of [400, 404, 410, 422]) assert.equal(classifyStatus(status), "validation");

  for (const status of [408, 409, 429, 500, 502, 503, 504]) assert.equal(classifyStatus(status), "retryable");
});

test("isPermanent is true for everything except retryable", () => {
  assert.equal(isPermanent("retryable"), false);
  assert.equal(isPermanent("auth"), true);
  assert.equal(isPermanent("validation"), true);
  assert.equal(isPermanent("malformed"), true);
});

test("backoffMs grows exponentially and stays within [d/2, d]", () => {
  const config = { baseMs: 1_000, maxMs: 60_000, random: () => 0 };
  assert.equal(backoffMs(0, null, config), 500); // ceiling 1000 -> d/2
  assert.equal(backoffMs(1, null, config), 1_000); // ceiling 2000 -> d/2
  assert.equal(backoffMs(2, null, config), 2_000); // ceiling 4000 -> d/2

  const high = { ...config, random: () => 0.999 };
  assert.ok(backoffMs(0, null, high) > 500 && backoffMs(0, null, high) <= 1_000);
});

test("backoffMs is capped at maxMs", () => {
  const config = { baseMs: 1_000, maxMs: 10_000, random: () => 1 };
  for (const attempt of [10, 20, 50]) assert.ok(backoffMs(attempt, null, config) <= 10_000);
});

test("a sane Retry-After header overrides the computed backoff", () => {
  const config = { baseMs: 1_000, maxMs: 300_000, random: () => 0 };
  assert.equal(backoffMs(5, "7", config), 7_000);
  // Out-of-range values are ignored and fall back to the computed delay.
  assert.equal(backoffMs(0, "99999", config), 500);
  assert.equal(backoffMs(0, "not-a-number", config), 500);
});
