import assert from "node:assert/strict";
import test from "node:test";

import { createInitialSyncSnapshot } from "./archiveSync.ts";
import { createDemoArchive } from "./archiveFixtures.ts";
import { runDestinationWorkerTick } from "./destinationWorker.server.ts";

const SNAPSHOT = createInitialSyncSnapshot(createDemoArchive());
const ITEM_COUNT = SNAPSHOT.archive.items.length;

function notionTarget(ownerId = "owner-1") {
  return {
    ownerId,
    archiveId: `archive-${ownerId}`,
    kind: "notion",
    config: { databaseId: "db-1", workspaceName: "WS" },
    secret: "notion-token",
  };
}

const okReader = { async snapshot() { return SNAPSHOT; } };

/** A fetch stub that makes every Notion page create/patch succeed. */
const notionOkFetcher = async () => new Response(JSON.stringify({ id: "page-x" }), { status: 200 });

function fakeStore(overrides = {}) {
  const calls = { acquire: [], release: [], outcomes: [], status: [] };
  const store = {
    calls,
    async activeDestinations() {
      return overrides.targets ?? [notionTarget()];
    },
    async deliveries() {
      return [];
    },
    async recordOutcome(ownerId, kind, outcome) {
      calls.outcomes.push({ ownerId, kind, outcome });
    },
    async markStatus(ownerId, kind, status) {
      calls.status.push({ ownerId, kind, status });
    },
    async acquireDeliveryLease(ownerId, kind, token, ttl, minInterval) {
      calls.acquire.push({ ownerId, kind, token, ttl, minInterval });
      if (typeof overrides.acquire === "function") return overrides.acquire(calls.acquire.length);
      return overrides.acquire ?? true;
    },
    async releaseDeliveryLease(ownerId, kind, token, outcome) {
      calls.release.push({ ownerId, kind, token, outcome });
    },
  };
  return store;
}

test("a held lease means the destination is skipped, not delivered", async () => {
  const store = fakeStore({ acquire: false });
  const result = await runDestinationWorkerTick(okReader, store, { fetcher: notionOkFetcher });

  assert.equal(result.skipped, 1);
  assert.equal(result.processed, 0);
  assert.equal(result.results[0].status, "skipped");
  assert.equal(store.calls.outcomes.length, 0);
  assert.equal(store.calls.release.length, 0, "nothing to release when the lease was never acquired");
});

test("two overlapping runs: the second destination whose lease is denied is skipped", async () => {
  const store = fakeStore({
    targets: [notionTarget("owner-1"), notionTarget("owner-2")],
    acquire: (n) => n === 1,
  });
  const result = await runDestinationWorkerTick(okReader, store, { fetcher: notionOkFetcher });

  assert.equal(result.processed, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.results.map((r) => r.status).sort(), ["delivered", "skipped"]);
  assert.equal(store.calls.release.length, 1, "only the run that took the lease releases it");
});

test("a successful run records every item and releases the lease with an outcome", async () => {
  const store = fakeStore();
  const result = await runDestinationWorkerTick(okReader, store, { fetcher: notionOkFetcher });

  assert.equal(result.processed, 1);
  assert.equal(result.results[0].status, "delivered");
  assert.equal(result.results[0].delivered, ITEM_COUNT);
  assert.equal(store.calls.outcomes.length, ITEM_COUNT);
  assert.equal(store.calls.release.length, 1);
  assert.equal(store.calls.release[0].token, store.calls.acquire[0].token);
  assert.equal(store.calls.release[0].outcome.status, "delivered");
  assert.equal(store.calls.release[0].outcome.correlationId, result.correlationId);
});

test("a manual sync passes minIntervalSeconds:0 through to the lease", async () => {
  const store = fakeStore();
  await runDestinationWorkerTick(okReader, store, { fetcher: notionOkFetcher, minIntervalSeconds: 0 });
  assert.equal(store.calls.acquire[0].minInterval, 0);
});

test("a delivery that throws is captured, the lease is released, and the tick never throws", async () => {
  const throwingReader = { async snapshot() { throw new Error("snapshot unavailable"); } };
  const store = fakeStore();
  const result = await runDestinationWorkerTick(throwingReader, store, { fetcher: notionOkFetcher });

  assert.equal(result.processed, 0);
  assert.equal(result.results[0].status, "failed");
  assert.match(result.results[0].error, /snapshot unavailable/);
  assert.equal(result.failures.length, 1);
  assert.equal(store.calls.release.length, 1, "the lease is released even after a failure");
});

test("an enumeration failure is reported without throwing", async () => {
  const store = fakeStore();
  store.activeDestinations = async () => {
    throw new Error("db down");
  };
  const result = await runDestinationWorkerTick(okReader, store, { fetcher: notionOkFetcher });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].error, /db down/);
  assert.equal(result.results.length, 0);
});
