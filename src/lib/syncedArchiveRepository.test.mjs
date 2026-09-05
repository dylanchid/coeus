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
