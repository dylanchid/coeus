import assert from "node:assert/strict";
import test from "node:test";

import { applyArchiveSyncBatch, createInitialSyncSnapshot } from "./archiveSync.ts";
import { createDemoArchive } from "./archiveFixtures.ts";
import { computeDirtyItems, runDestinationDelivery } from "./destinationDelivery.ts";

function delivery(itemId, lastDeliveredRevision, externalRef) {
  return {
    destinationId: "dest-1",
    itemId,
    externalRef,
    lastDeliveredRevision,
    status: "delivered",
    lastAttemptedAt: null,
    lastError: null,
    lastHttpStatus: null,
  };
}

function upsert(operationId, value, changedFields) {
  return { operationId, action: "upsert", entityKind: "item", entityId: value.id, changedFields, value };
}

function deleteOp(operationId, entityId) {
  return { operationId, action: "delete", entityKind: "item", entityId };
}

function batch(baseRevision, operations) {
  return { syncVersion: 1, archiveId: "archive-1", clientId: "device-a", baseRevision, operations };
}

test("a newly connected destination is dirty for every existing item, even at revision 0", () => {
  const snapshot = createInitialSyncSnapshot(createDemoArchive());
  const actions = computeDirtyItems(snapshot, []);
  assert.equal(actions.length, 4);
  for (const action of actions) {
    assert.equal(action.kind, "upsert");
    assert.equal(action.targetRevision, 0);
    assert.equal(action.existingExternalRef, null);
  }
});

test("nothing is dirty once every item is delivered at its current revision", () => {
  const snapshot = createInitialSyncSnapshot(createDemoArchive());
  const deliveries = snapshot.archive.items.map((item) => delivery(item.id, 0, `ext-${item.id}`));
  assert.deepEqual(computeDirtyItems(snapshot, deliveries), []);
});

test("editing one item's field only marks that item dirty", () => {
  const initial = createInitialSyncSnapshot(createDemoArchive());
  const deliveries = initial.archive.items.map((item) => delivery(item.id, 0, `ext-${item.id}`));
  const original = initial.archive.items.find((item) => item.id === "demo-links");
  const { snapshot } = applyArchiveSyncBatch(initial, batch(0, [
    upsert("op-note", { ...original, note: "Updated note" }, ["note"]),
  ]));

  const actions = computeDirtyItems(snapshot, deliveries);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], {
    kind: "upsert",
    itemId: "demo-links",
    item: snapshot.archive.items.find((item) => item.id === "demo-links"),
    targetRevision: 1,
    existingExternalRef: "ext-demo-links",
  });
});

test("deleting a previously delivered item produces a delete action", () => {
  const initial = createInitialSyncSnapshot(createDemoArchive());
  const deliveries = initial.archive.items.map((item) => delivery(item.id, 0, `ext-${item.id}`));
  const { snapshot } = applyArchiveSyncBatch(initial, batch(0, [deleteOp("op-delete", "demo-gardens")]));

  const actions = computeDirtyItems(snapshot, deliveries);
  assert.deepEqual(actions, [{
    kind: "delete",
    itemId: "demo-gardens",
    targetRevision: 1,
    existingExternalRef: "ext-demo-gardens",
  }]);
});

test("deleting an item that was never delivered produces no action", () => {
  const initial = createInitialSyncSnapshot(createDemoArchive());
  const deliveries = initial.archive.items
    .filter((item) => item.id !== "demo-links")
    .map((item) => delivery(item.id, 0, `ext-${item.id}`));
  const { snapshot } = applyArchiveSyncBatch(initial, batch(0, [deleteOp("op-delete", "demo-links")]));
  assert.deepEqual(computeDirtyItems(snapshot, deliveries), []);
});

test("runDestinationDelivery stops the batch on the first auth failure", async () => {
  const snapshot = createInitialSyncSnapshot(createDemoArchive());
  const calls = [];
  const adapter = {
    async pushUpsert(item) {
      calls.push(item.id);
      if (calls.length === 2) return { ok: false, authError: true, httpStatus: 401 };
      return { ok: true, externalRef: `ext-${item.id}` };
    },
    async pushDelete() {
      throw new Error("not expected in this test");
    },
  };

  const outcomes = await runDestinationDelivery(snapshot, [], adapter);
  assert.equal(calls.length, 2);
  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[0].result.ok, true);
  assert.equal(outcomes[1].result.authError, true);
});
