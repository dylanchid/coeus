import assert from "node:assert/strict";
import test from "node:test";

import {
  handleArchiveExport,
  handleArchiveRestore,
  handleContentCapture,
} from "./archiveRecoveryApi.ts";
import { createRecoverySnapshot } from "./archiveRecovery.ts";
import { createInitialSyncSnapshot } from "./archiveSync.ts";

const empty = { version: 1, items: [], collections: [], socialPosts: [] };
const initial = createInitialSyncSnapshot(empty, "2026-09-04T00:00:00.000Z");

class MemoryRecoveryStore {
  async export() {
    return { archiveId: "archive-1", current: initial, revisions: [{ revision: 0, createdAt: initial.generatedAt }], contentSnapshots: [] };
  }
  async restore(_owner, revision) { return { archiveId: "archive-1", snapshot: createRecoverySnapshot(initial, revision + 1, "2026-09-04T01:00:00.000Z") }; }
  async capture(_owner, itemId) { return { id: "capture-1", itemId, canonicalUrl: "https://example.com", fetchedUrl: "https://example.com", status: "ready", mediaType: "text/html", byteLength: 4, sha256: "a".repeat(64), capturedAt: initial.generatedAt, createdAt: initial.generatedAt }; }
  async content() { throw new Error("not used"); }
  async deleteAccount() {}
}

const dependencies = (ownerId = "user-1") => ({ authenticate: async () => ownerId, store: new MemoryRecoveryStore() });

test("lossless export includes the canonical sync snapshot and history metadata", async () => {
  const response = await handleArchiveExport(dependencies());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  const body = await response.json();
  assert.equal(body.format, "bareaga.archive.export.v1");
  assert.deepEqual(body.current, initial);
  assert.equal(body.revisions[0].revision, 0);
});

test("recovery requires an integer revision and returns a new immutable snapshot", async () => {
  const invalid = await handleArchiveRestore(new Request("http://localhost", { method: "POST", body: "{}" }), dependencies());
  assert.equal(invalid.status, 400);
  const restored = await handleArchiveRestore(new Request("http://localhost", { method: "POST", body: JSON.stringify({ revision: 0 }) }), dependencies());
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).snapshot.revision, 1);
});

test("private content capture requires an archive item id and authentication", async () => {
  const unauthorized = await handleContentCapture(new Request("http://localhost", { method: "POST", body: JSON.stringify({ itemId: "item-1" }) }), dependencies(null));
  assert.equal(unauthorized.status, 401);
  const invalid = await handleContentCapture(new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }), dependencies());
  assert.equal(invalid.status, 400);
  const captured = await handleContentCapture(new Request("http://localhost", { method: "POST", body: JSON.stringify({ itemId: "item-1" }) }), dependencies());
  assert.equal(captured.status, 201);
  assert.equal((await captured.json()).status, "ready");
});
