import assert from "node:assert/strict";
import test from "node:test";

import { handleArchiveGet, handleArchiveSync } from "./archiveApi.ts";
import {
  ArchiveNotFoundError,
  ArchiveRevisionAheadError,
} from "./archiveSyncStore.server.ts";
import { applyArchiveSyncBatch, createInitialSyncSnapshot } from "./archiveSync.ts";

const EMPTY_ARCHIVE = { version: 1, items: [], collections: [], socialPosts: [] };

class MemoryArchiveStore {
  archiveId = "archive-1";
  snapshot = createInitialSyncSnapshot(EMPTY_ARCHIVE, "2026-09-04T00:00:00.000Z");
  operations = new Map();
  syncCalls = 0;

  async getOrCreate() {
    return { archiveId: this.archiveId, snapshot: this.snapshot };
  }

  async sync(_ownerId, batch) {
    this.syncCalls += 1;
    if (batch.archiveId !== this.archiveId) throw new ArchiveNotFoundError();
    if (batch.baseRevision > this.snapshot.revision) {
      throw new ArchiveRevisionAheadError(await this.getOrCreate());
    }
    const stored = batch.operations.filter((operation) => this.operations.has(operation.operationId));
    const pending = batch.operations.filter((operation) => !this.operations.has(operation.operationId));
    const result = applyArchiveSyncBatch(this.snapshot, { ...batch, operations: pending });
    this.snapshot = result.snapshot;
    for (const operation of pending) {
      this.operations.set(operation.operationId, {
        accepted: result.acceptedOperationIds.includes(operation.operationId),
        conflicts: result.conflicts.filter((conflict) => conflict.operationId === operation.operationId),
      });
    }
    return {
      archiveId: this.archiveId,
      snapshot: this.snapshot,
      acceptedOperationIds: [
        ...stored.filter((operation) => this.operations.get(operation.operationId).accepted)
          .map((operation) => operation.operationId),
        ...result.acceptedOperationIds,
      ],
      conflicts: [
        ...stored.flatMap((operation) => this.operations.get(operation.operationId).conflicts),
        ...result.conflicts,
      ],
    };
  }
}

function dependencies(store, ownerId = "user-1") {
  return { authenticate: async () => ownerId, store };
}

function syncRequest(body) {
  return new Request("http://localhost/api/archive/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function collectionOperation(operationId = "op-1") {
  const value = {
    id: "reading-list",
    name: "Reading list",
    description: "Saved reading",
    visibility: "private",
    kind: "personal",
    createdAt: "2026-09-04T00:00:00.000Z",
  };
  return {
    operationId,
    action: "upsert",
    entityKind: "collection",
    entityId: value.id,
    changedFields: Object.keys(value),
    value,
  };
}

function batch(overrides = {}) {
  return {
    syncVersion: 1,
    archiveId: "archive-1",
    clientId: "device-a",
    baseRevision: 0,
    operations: [collectionOperation()],
    ...overrides,
  };
}

test("archive GET requires authentication and initializes an archive", async () => {
  const store = new MemoryArchiveStore();
  const unauthorized = await handleArchiveGet(dependencies(store, null));
  assert.equal(unauthorized.status, 401);
  const response = await handleArchiveGet(dependencies(store));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("etag"), '"revision-0"');
  assert.deepEqual(await response.json(), { archiveId: "archive-1", snapshot: store.snapshot });
});

test("archive sync validates JSON before calling storage", async () => {
  const store = new MemoryArchiveStore();
  const response = await handleArchiveSync(syncRequest({ surprise: true }), dependencies(store));
  assert.equal(response.status, 400);
  assert.equal(store.syncCalls, 0);
});

test("archive sync applies and idempotently replays operations", async () => {
  const store = new MemoryArchiveStore();
  const first = await handleArchiveSync(syncRequest(batch()), dependencies(store));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).snapshot.revision, 1);
  const replay = await handleArchiveSync(syncRequest(batch()), dependencies(store));
  const replayed = await replay.json();
  assert.equal(replay.status, 200);
  assert.equal(replayed.snapshot.revision, 1);
  assert.deepEqual(replayed.acceptedOperationIds, ["op-1"]);
});

test("archive sync rejects another archive and an impossible future base", async () => {
  const store = new MemoryArchiveStore();
  const missing = await handleArchiveSync(syncRequest(batch({ archiveId: "other" })), dependencies(store));
  assert.equal(missing.status, 404);
  const ahead = await handleArchiveSync(syncRequest(batch({ baseRevision: 4 })), dependencies(store));
  assert.equal(ahead.status, 409);
  assert.equal((await ahead.json()).details.snapshot.revision, 0);
});

test("failed reductions do not mutate the confirmed archive", async () => {
  const store = new MemoryArchiveStore();
  const incomplete = collectionOperation("op-incomplete");
  incomplete.changedFields = ["name"];
  const before = structuredClone(store.snapshot);
  const response = await handleArchiveSync(syncRequest(batch({ operations: [incomplete] })), dependencies(store));
  assert.equal(response.status, 503);
  assert.deepEqual(store.snapshot, before);
  assert.equal(store.operations.size, 0);
});
