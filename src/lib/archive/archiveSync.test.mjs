import assert from "node:assert/strict";
import test from "node:test";

import { createDemoArchive } from "./archiveFixtures.ts";
import {
  applyArchiveSyncBatch,
  createInitialSyncSnapshot,
  parseArchiveSyncBatch,
  parseArchiveSyncSnapshot,
} from "./archiveSync.ts";

function upsert(operationId, value, changedFields) {
  return { operationId, action: "upsert", entityKind: "item", entityId: value.id, changedFields, value };
}

function batch(baseRevision, operations) {
  return { syncVersion: 1, archiveId: "archive-1", clientId: "device-a", baseRevision, operations };
}

test("initial snapshots retain portable archive data and initialize field clocks", () => {
  const archive = createDemoArchive();
  const snapshot = createInitialSyncSnapshot(archive, "2026-09-04T00:00:00.000Z");
  assert.equal(snapshot.revision, 0);
  assert.deepEqual(snapshot.archive, archive);
  assert.equal(snapshot.entityVersions[`item:${archive.items[0].id}`].fields.note, 0);
});

test("stale clients merge changes to different fields", () => {
  const initial = createInitialSyncSnapshot(createDemoArchive());
  const original = initial.archive.items[0];
  const first = applyArchiveSyncBatch(initial, batch(0, [
    upsert("op-note", { ...original, note: "Edited on the laptop" }, ["note"]),
  ]));
  const second = applyArchiveSyncBatch(first.snapshot, batch(0, [
    upsert("op-star", { ...original, starred: false }, ["starred"]),
  ]));
  const item = second.snapshot.archive.items.find((candidate) => candidate.id === original.id);
  assert.equal(item.note, "Edited on the laptop");
  assert.equal(item.starred, false);
  assert.deepEqual(second.conflicts, []);
  assert.equal(second.snapshot.revision, 2);
});

test("stale edits to the same field preserve server state and report a conflict", () => {
  const initial = createInitialSyncSnapshot(createDemoArchive());
  const original = initial.archive.items[0];
  const first = applyArchiveSyncBatch(initial, batch(0, [
    upsert("op-first", { ...original, note: "First accepted edit" }, ["note"]),
  ]));
  const second = applyArchiveSyncBatch(first.snapshot, batch(0, [
    upsert("op-stale", { ...original, note: "Offline edit" }, ["note"]),
  ]));
  assert.equal(second.snapshot, first.snapshot);
  assert.equal(second.snapshot.archive.items[0].note, "First accepted edit");
  assert.deepEqual(second.acceptedOperationIds, []);
  assert.deepEqual(second.conflicts[0], {
    operationId: "op-stale",
    entityKind: "item",
    entityId: original.id,
    fields: ["note"],
    reason: "field_changed",
  });
});

test("operations from the same client batch apply in order", () => {
  const initial = createInitialSyncSnapshot(createDemoArchive());
  const original = initial.archive.items[0];
  const result = applyArchiveSyncBatch(initial, batch(0, [
    upsert("op-draft", { ...original, note: "Draft" }, ["note"]),
    upsert("op-final", { ...original, note: "Final" }, ["note"]),
  ]));
  assert.equal(result.snapshot.archive.items[0].note, "Final");
  assert.deepEqual(result.acceptedOperationIds, ["op-draft", "op-final"]);
  assert.deepEqual(result.conflicts, []);
});

test("delete/update races preserve the newer server edit", () => {
  const initial = createInitialSyncSnapshot(createDemoArchive());
  const original = initial.archive.items[0];
  const edited = applyArchiveSyncBatch(initial, batch(0, [
    upsert("op-edit", { ...original, state: "read" }, ["state"]),
  ]));
  const deleted = applyArchiveSyncBatch(edited.snapshot, batch(0, [{
    operationId: "op-delete", action: "delete", entityKind: "item", entityId: original.id,
  }]));
  assert.ok(deleted.snapshot.archive.items.some((item) => item.id === original.id));
  assert.equal(deleted.conflicts[0].reason, "delete_raced_with_update");
});

test("sync request validation rejects unknown versions and malformed entities", () => {
  assert.deepEqual(parseArchiveSyncBatch({}), {
    ok: false,
    error: "Unsupported sync version: undefined",
  });
  const archive = createDemoArchive();
  const malformed = upsert("op-1", { ...archive.items[0], url: "javascript:bad" }, ["url"]);
  assert.deepEqual(parseArchiveSyncBatch(batch(0, [malformed])), {
    ok: false,
    error: "Operation 0 contains an invalid entity value",
  });
});

test("durable snapshot validation rejects corrupt revision metadata", () => {
  const snapshot = createInitialSyncSnapshot(createDemoArchive());
  snapshot.entityVersions[`item:${snapshot.archive.items[0].id}`].fields.note = 2;
  assert.deepEqual(parseArchiveSyncSnapshot(snapshot), {
    ok: false,
    error: `Sync snapshot has invalid field revisions for item:${snapshot.archive.items[0].id}`,
  });
});
