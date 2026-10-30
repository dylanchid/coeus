import assert from "node:assert/strict";
import test from "node:test";
import {
  DESTINATION_DELIVERY_QUEUE,
  DESTINATION_RETRY_DELAY_SECONDS,
  enqueueDestinationDelivery,
  isDestinationDeliveryRequest,
  logQueueMessageMetrics,
  logQueueProcessed,
  processDestinationDeliveryRequest,
} from "./destinationQueue.server.ts";

const request = { requestId: "request-1", ownerId: "owner-1", correlationId: "correlation-1" };

test("destination queue only sends compact requests when the feature is enabled", async () => {
  const calls = [];
  assert.equal(await enqueueDestinationDelivery(request, { enabled: false, send: async (...args) => calls.push(args) }), false);
  assert.equal(calls.length, 0);
  assert.equal(await enqueueDestinationDelivery(request, { enabled: true, send: async (...args) => calls.push(args) }), true);
  assert.deepEqual(calls[0], [DESTINATION_DELIVERY_QUEUE, request, { idempotencyKey: "destination-delivery:request-1" }]);
});

test("destination queue validates its small, credential-free message shape", () => {
  assert.equal(isDestinationDeliveryRequest(request), true);
  assert.equal(isDestinationDeliveryRequest({ ...request, secret: "never" }), false);
  assert.equal(isDestinationDeliveryRequest({ ownerId: "owner-1", correlationId: "correlation-1" }), false);
  assert.equal(isDestinationDeliveryRequest({ ...request, ownerId: "" }), false);
});

test("a full queue batch schedules one follow-up after the tick", async () => {
  const queued = [];
  const result = await processDestinationDeliveryRequest(request, {
    enabled: true,
    runTick: async () => ({ correlationId: request.correlationId, processed: 1, skipped: 0, failures: [], results: [{ ownerId: request.ownerId, kind: "notion", status: "delivered", delivered: 100, failed: 0, authError: false }] }),
    enqueue: async (next) => { queued.push(next); return true; },
  });
  assert.equal(result?.processed, 1);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].ownerId, request.ownerId);
  assert.notEqual(queued[0].requestId, request.requestId);
});

test("a retryable delivery schedules a delayed follow-up", async () => {
  const queued = [];
  await processDestinationDeliveryRequest(request, {
    enabled: true,
    runTick: async () => ({
      correlationId: request.correlationId,
      processed: 1,
      skipped: 0,
      failures: [{ ownerId: request.ownerId, kind: "notion", error: "provider unavailable" }],
      results: [{ ownerId: request.ownerId, kind: "notion", status: "failed", delivered: 0, failed: 1, authError: false }],
    }),
    enqueue: async (next, options) => { queued.push({ next, options }); return true; },
  });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].options.delaySeconds, DESTINATION_RETRY_DELAY_SECONDS);
});

test("an auth failure does not schedule another queue attempt", async () => {
  const queued = [];
  await processDestinationDeliveryRequest(request, {
    enabled: true,
    runTick: async () => ({
      correlationId: request.correlationId,
      processed: 1,
      skipped: 0,
      failures: [{ ownerId: request.ownerId, kind: "notion", error: "Notion authentication failed" }],
      results: [{ ownerId: request.ownerId, kind: "notion", status: "failed", delivered: 0, failed: 1, authError: true }],
    }),
    enqueue: async (next) => { queued.push(next); return true; },
  });
  assert.equal(queued.length, 0);
});

test("lease contention schedules a delayed retry instead of losing a redelivery", async () => {
  const queued = [];
  await processDestinationDeliveryRequest(request, {
    enabled: true,
    runTick: async () => ({
      correlationId: request.correlationId,
      processed: 0,
      skipped: 1,
      failures: [],
      results: [{ ownerId: request.ownerId, kind: "notion", status: "skipped", delivered: 0, failed: 0, authError: false }],
    }),
    enqueue: async (next, options) => { queued.push({ next, options }); return true; },
  });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].options.delaySeconds, DESTINATION_RETRY_DELAY_SECONDS);
});

function captureLogs(run) {
  const lines = [];
  const original = console.info;
  console.info = (line) => lines.push(JSON.parse(line));
  try { run(); } finally { console.info = original; }
  return lines;
}

const message = (deliveryCount, now) => ({
  messageId: "message-1",
  deliveryCount,
  createdAt: new Date("2026-10-30T00:00:00Z"),
  expiresAt: new Date("2026-10-31T00:00:00Z"),
  now: new Date(now),
});

test("queue metrics log age and retries, and flag only messages past half their retention", () => {
  const early = message(2, "2026-10-30T01:00:00Z");
  const earlyLogs = captureLogs(() => logQueueMessageMetrics(request, early, early.now));
  assert.deepEqual(earlyLogs.map((line) => line.event), ["destination_delivery.queue.metrics"]);
  assert.equal(earlyLogs[0].retries, 1);
  assert.equal(earlyLogs[0].ageSeconds, 3600);

  const late = message(5, "2026-10-30T20:00:00Z");
  const lateLogs = captureLogs(() => logQueueMessageMetrics(request, late, late.now));
  assert.deepEqual(lateLogs.map((line) => line.event), [
    "destination_delivery.queue.metrics",
    "destination_delivery.queue.retention_near_deadline",
  ]);
  assert.ok(lateLogs[1].retentionUsedRatio > 0.8);
  assert.ok(lateLogs.every((line) => !line.event.endsWith(".error")), "retention warnings must not count as delivery errors");
});

test("queue processed log sums delivered and failed items and marks a flag-disabled skip", () => {
  const result = { correlationId: request.correlationId, processed: 2, skipped: 1, failures: [], results: [
    { ownerId: "owner-1", kind: "notion", status: "delivered", delivered: 100, failed: 0, authError: false },
    { ownerId: "owner-1", kind: "obsidian_git", status: "failed", delivered: 10, failed: 3, authError: false },
  ] };
  const [done] = captureLogs(() => logQueueProcessed(request, { messageId: "m", deliveryCount: 1 }, result, 1234));
  assert.equal(done.event, "destination_delivery.queue.processed");
  assert.deepEqual([done.delivered, done.failed, done.skipped, done.durationMs, done.skippedByFlag], [110, 3, 1, 1234, false]);
  const [skipped] = captureLogs(() => logQueueProcessed(request, { messageId: "m", deliveryCount: 1 }, null, 5));
  assert.deepEqual([skipped.delivered, skipped.skippedByFlag], [0, true]);
});
