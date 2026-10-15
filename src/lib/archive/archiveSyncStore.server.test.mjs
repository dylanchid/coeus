import assert from "node:assert/strict";
import test from "node:test";

import { createInitialSyncSnapshot } from "./archiveSync.ts";
import { SupabaseArchiveSyncStore } from "./archiveSyncStore.server.ts";

test("stored operation lookup chunks UUID-length ids to keep PostgREST URLs bounded", async () => {
  const lookupSizes = [];
  let commitSnapshot;
  const supabase = {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        in(_column, ids) {
          lookupSizes.push(ids);
          return Promise.resolve({ data: [], error: null });
        },
      };
      return query;
    },
    rpc(_name, args) {
      commitSnapshot = args.p_snapshot;
      return { single: async () => ({ data: { committed: true, current_revision: 1, snapshot: args.p_snapshot }, error: null }) };
    },
  };
  const store = new SupabaseArchiveSyncStore(supabase);
  const current = createInitialSyncSnapshot({ version: 1, items: [], collections: [], socialPosts: [] });
  store.getOrCreate = async () => ({ archiveId: "archive-1", snapshot: current });
  const operations = Array.from({ length: 500 }, (_, index) => ({
    operationId: `op-${"a".repeat(36)}-${index}`,
    action: "delete",
    entityKind: "item",
    entityId: `item-${index}`,
  }));

  await store.sync("owner-1", {
    syncVersion: 1,
    archiveId: "archive-1",
    clientId: "client-1",
    baseRevision: 0,
    operations,
  });

  assert.equal(lookupSizes.length, 5);
  assert.deepEqual(lookupSizes.map((ids) => ids.length), [100, 100, 100, 100, 100]);
  assert.ok(lookupSizes.every((ids) => ids.every((id) => id.length >= 39)));
  assert.equal(commitSnapshot.revision, 1);
});
