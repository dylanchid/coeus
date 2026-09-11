import assert from "node:assert/strict";
import test from "node:test";

import { createDemoArchive } from "./archiveFixtures.ts";
import { applyArchiveSyncBatch, createInitialSyncSnapshot } from "./archiveSync.ts";
import { LocalStorageArchiveRepository } from "./localArchiveRepository.ts";
import { SyncedArchiveRepository } from "./syncedArchiveRepository.ts";

function memoryStorage(seed) {
  const values = new Map(seed ? [["coeus.archive.v1", JSON.stringify(seed)]] : []);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("first authenticated sync uploads the retained local archive as operations", async () => {
  const store = memoryStorage(createDemoArchive());
  let snapshot = createInitialSyncSnapshot({ version: 1, items: [], collections: [], socialPosts: [] });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/archive") return Response.json({ archiveId: "archive-1", snapshot });
    const batch = JSON.parse(options.body);
    const result = applyArchiveSyncBatch(snapshot, batch);
    snapshot = result.snapshot;
    return Response.json(result);
  };
  try {
    const repo = new SyncedArchiveRepository(new LocalStorageArchiveRepository(store), store);
    const local = await repo.load();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(snapshot.archive.items.length, local.items.length);
    assert.equal(snapshot.archive.collections.length, local.collections.length);
    assert.equal(repo.getSyncStatus(), "synced");
  } finally { globalThis.fetch = originalFetch; }
});

const EMPTY_ARCHIVE = { version: 1, items: [], collections: [], socialPosts: [] };
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function harness({ archiveFetch, syncFetch, seedArchive = createDemoArchive(), queueSeed } = {}) {
  const values = new Map([["coeus.archive.v1", JSON.stringify(seedArchive)]]);
  if (queueSeed !== undefined) values.set("coeus.archive.sync-queue.v1", queueSeed);
  const store = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const scheduled = [];
  const scheduler = (fn, ms) => {
    const timer = { fn, ms };
    scheduled.push(timer);
    return timer;
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/archive") return archiveFetch(options);
    return syncFetch(options);
  };
  const repo = new SyncedArchiveRepository(new LocalStorageArchiveRepository(store), store, {
    scheduler,
    backoff: { random: () => 0 },
  });
  return { repo, store, scheduled, restore: () => { globalThis.fetch = originalFetch; } };
}

test("a permanent 400 on sync pauses auto-sync and retains the queued operations", async () => {
  let snapshot = createInitialSyncSnapshot(EMPTY_ARCHIVE);
  const h = harness({
    archiveFetch: () => Response.json({ archiveId: "a1", snapshot }),
    syncFetch: () => new Response(JSON.stringify({ error: "rejected" }), { status: 400 }),
  });
  try {
    await h.repo.load();
    await flush();
    const state = h.repo.getSyncState();
    assert.equal(state.status, "error");
    assert.equal(state.paused, true);
    assert.ok(state.pending > 0, "the rejected operations stay queued");
    assert.equal(h.scheduled.length, 0, "a permanent failure schedules no retry");
    assert.ok(JSON.parse(h.store.getItem("coeus.archive.sync-queue.v1")).operations.length > 0);
  } finally { h.restore(); }
});

test("a 503 on sync backs off, then succeeds when the retry fires", async () => {
  let snapshot = createInitialSyncSnapshot(EMPTY_ARCHIVE);
  let failNext = true;
  const h = harness({
    archiveFetch: () => Response.json({ archiveId: "a1", snapshot }),
    syncFetch: (options) => {
      if (failNext) { failNext = false; return new Response("{}", { status: 503 }); }
      const result = applyArchiveSyncBatch(snapshot, JSON.parse(options.body));
      snapshot = result.snapshot;
      return Response.json(result);
    },
  });
  try {
    await h.repo.load();
    await flush();
    assert.equal(h.repo.getSyncState().status, "offline");
    assert.equal(h.scheduled.length, 1);
    assert.ok(h.scheduled[0].ms >= 500);

    h.scheduled[0].fn();
    await flush();
    const state = h.repo.getSyncState();
    assert.equal(state.status, "synced");
    assert.equal(state.pending, 0);
  } finally { h.restore(); }
});

test("a Retry-After header sets the backoff delay", async () => {
  const snapshot = createInitialSyncSnapshot(EMPTY_ARCHIVE);
  const h = harness({
    archiveFetch: () => Response.json({ archiveId: "a1", snapshot }),
    syncFetch: () => new Response("{}", { status: 429, headers: { "Retry-After": "12" } }),
  });
  try {
    await h.repo.load();
    await flush();
    assert.equal(h.scheduled.length, 1);
    assert.equal(h.scheduled[0].ms, 12_000);
  } finally { h.restore(); }
});

test("a 403 pauses as auth_required and retrySync() resumes", async () => {
  const snapshot = createInitialSyncSnapshot(EMPTY_ARCHIVE);
  let deny = true;
  const h = harness({
    seedArchive: EMPTY_ARCHIVE,
    archiveFetch: () => (deny ? new Response("{}", { status: 403 }) : Response.json({ archiveId: "a1", snapshot })),
    syncFetch: () => Response.json({ snapshot, acceptedOperationIds: [], conflicts: [] }),
  });
  try {
    await h.repo.load();
    await flush();
    assert.equal(h.repo.getSyncState().status, "auth_required");
    assert.equal(h.repo.getSyncState().paused, true);
    assert.equal(h.scheduled.length, 0);

    deny = false;
    h.repo.retrySync();
    await flush();
    assert.equal(h.repo.getSyncState().status, "synced");
    assert.equal(h.repo.getSyncState().paused, false);
  } finally { h.restore(); }
});

test("a malformed server snapshot pauses with an error rather than looping", async () => {
  const h = harness({
    seedArchive: EMPTY_ARCHIVE,
    archiveFetch: () => Response.json({ archiveId: "a1", snapshot: { not: "a snapshot" } }),
    syncFetch: () => new Response("{}", { status: 200 }),
  });
  try {
    await h.repo.load();
    await flush();
    assert.equal(h.repo.getSyncState().status, "error");
    assert.equal(h.repo.getSyncState().paused, true);
    assert.equal(h.scheduled.length, 0);
  } finally { h.restore(); }
});

test("a 401 on the archive read is a benign local state, not a paused failure", async () => {
  const h = harness({
    seedArchive: EMPTY_ARCHIVE,
    archiveFetch: () => new Response("{}", { status: 401 }),
    syncFetch: () => new Response("{}", { status: 200 }),
  });
  try {
    await h.repo.load();
    await flush();
    assert.equal(h.repo.getSyncState().status, "local");
    assert.equal(h.repo.getSyncState().paused, false);
    assert.equal(h.scheduled.length, 0);
  } finally { h.restore(); }
});

test("a corrupt persisted queue is set aside for recovery, not silently dropped", async () => {
  const snapshot = createInitialSyncSnapshot(EMPTY_ARCHIVE);
  const h = harness({
    seedArchive: EMPTY_ARCHIVE,
    queueSeed: "{ this is not json",
    archiveFetch: () => Response.json({ archiveId: "a1", snapshot }),
    syncFetch: () => Response.json({ snapshot, acceptedOperationIds: [], conflicts: [] }),
  });
  try {
    assert.equal(h.repo.getSyncState().recoveredCorruptQueue, true);
    assert.equal(h.store.getItem("coeus.archive.sync-queue.v1.corrupt"), "{ this is not json");
    const exported = h.repo.exportQueue();
    assert.equal(exported.corrupt, "{ this is not json");
    assert.deepEqual(exported.queue.operations, []);
  } finally { h.restore(); }
});

test("a structurally-wrong (but valid JSON) queue is also preserved", async () => {
  const snapshot = createInitialSyncSnapshot(EMPTY_ARCHIVE);
  const h = harness({
    seedArchive: EMPTY_ARCHIVE,
    queueSeed: JSON.stringify({ clientId: "c1", operations: "nope" }),
    archiveFetch: () => Response.json({ archiveId: "a1", snapshot }),
    syncFetch: () => Response.json({ snapshot, acceptedOperationIds: [], conflicts: [] }),
  });
  try {
    assert.equal(h.repo.getSyncState().recoveredCorruptQueue, true);
    assert.ok(h.store.getItem("coeus.archive.sync-queue.v1.corrupt").includes("nope"));
  } finally { h.restore(); }
});

test("pending operations survive a reload into a fresh repository", async () => {
  let snapshot = createInitialSyncSnapshot(EMPTY_ARCHIVE);
  const h = harness({
    archiveFetch: () => Response.json({ archiveId: "a1", snapshot }),
    syncFetch: () => new Response("{}", { status: 400 }),
  });
  try {
    await h.repo.load();
    await flush();
    const pending = h.repo.getSyncState().pending;
    assert.ok(pending > 0);

    const reloaded = new SyncedArchiveRepository(new LocalStorageArchiveRepository(h.store), h.store, {
      scheduler: (fn, ms) => ({ fn, ms }),
    });
    assert.equal(reloaded.getSyncState().pending, pending);
  } finally { h.restore(); }
});
