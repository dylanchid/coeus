import assert from "node:assert/strict";
import test from "node:test";
import {
  DESTINATION_DELIVERY_QUEUE,
  DESTINATION_RETRY_DELAY_SECONDS,
  enqueueDestinationDelivery,
  isDestinationDeliveryRequest,
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
