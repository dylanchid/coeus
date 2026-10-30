import assert from "node:assert/strict";
import test from "node:test";

import { isNearRetentionDeadline, queueMessageHealth } from "./queueRetention.ts";

const createdAt = new Date("2026-10-30T00:00:00Z");
const expiresAt = new Date("2026-10-31T00:00:00Z");

test("queueMessageHealth reports age, retries and retention headroom", () => {
  const health = queueMessageHealth({ createdAt, expiresAt, deliveryCount: 3 }, new Date("2026-10-30T06:00:00Z"));
  assert.deepEqual(health, { ageSeconds: 21600, retries: 2, retentionRemainingSeconds: 64800, retentionUsedRatio: 0.25 });
  assert.equal(isNearRetentionDeadline(health), false);
});

test("a first delivery has zero retries and a message past half its retention is near the deadline", () => {
  const fresh = queueMessageHealth({ createdAt, expiresAt, deliveryCount: 1 }, createdAt);
  assert.equal(fresh.retries, 0);
  assert.equal(fresh.retentionUsedRatio, 0);
  const old = queueMessageHealth({ createdAt, expiresAt, deliveryCount: 4 }, new Date("2026-10-30T12:00:00Z"));
  assert.equal(isNearRetentionDeadline(old), true);
});

test("an expired or clock-skewed message is clamped rather than negative or above 1", () => {
  const expired = queueMessageHealth({ createdAt, expiresAt, deliveryCount: 9 }, new Date("2026-11-02T00:00:00Z"));
  assert.equal(expired.retentionUsedRatio, 1);
  assert.equal(expired.retentionRemainingSeconds, 0);
  const skewed = queueMessageHealth({ createdAt, expiresAt, deliveryCount: 1 }, new Date("2026-10-29T23:59:00Z"));
  assert.equal(skewed.ageSeconds, 0);
  assert.equal(skewed.retentionUsedRatio, 0);
});
