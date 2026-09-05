import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAccountDelete,
  handleArchiveExport,
  handleArchiveRestore,
  handleArchiveRevisions,
  handleContentCapture,
  handleContentDownload,
} from "./archiveRecoveryApi.ts";

const EMPTY_ARCHIVE = { version: 1, items: [], collections: [], socialPosts: [] };

class MemoryArchiveRecoveryStore {
  archiveId = "archive-1";
  current = { syncVersion: 1, revision: 0, generatedAt: "2026-09-04T00:00:00.000Z", archive: EMPTY_ARCHIVE, entityVersions: {} };
  revisions = [{ revision: 0, createdAt: "2026-09-04T00:00:00.000Z" }];
  contentSnapshots = [];
  items = new Map([["item-1", { url: "https://example.com/item-1" }]]);
  snapshots = new Map([["snap-1", { body: new Blob(["captured"], { type: "text/plain" }), mediaType: "text/plain", filename: "snap-1.txt" }]]);
  deleted = false;
  failNext = {};

  consume(key) {
    const error = this.failNext[key];
    this.failNext[key] = null;
    return error;
  }

  async export() {
    if (this.failNext.export) throw this.consume("export");
    return { archiveId: this.archiveId, current: this.current, revisions: this.revisions, contentSnapshots: this.contentSnapshots };
  }

  async restore(_ownerId, revision) {
    if (this.failNext.restore) throw this.consume("restore");
    const found = this.revisions.find((entry) => entry.revision === revision);
    if (!found) throw new Error("Revision not found");
    return { archiveId: this.archiveId, snapshot: this.current };
  }

  async capture(_ownerId, itemId) {
    if (this.failNext.capture) throw this.consume("capture");
    const item = this.items.get(itemId);
    if (!item) throw new Error("Archive item not found");
    const summary = {
      id: `snap-${itemId}`, itemId, canonicalUrl: item.url, fetchedUrl: null, status: "ready",
      mediaType: "text/html", byteLength: 8, sha256: null, capturedAt: "2026-09-04T00:00:00.000Z", createdAt: "2026-09-04T00:00:00.000Z",
    };
    this.contentSnapshots = [summary, ...this.contentSnapshots];
    return summary;
  }

  async content(_ownerId, snapshotId) {
    if (this.failNext.content) throw this.consume("content");
    const found = this.snapshots.get(snapshotId);
    if (!found) throw new Error("Captured content not found");
    return found;
  }

  async deleteAccount() {
    if (this.failNext.deleteAccount) throw this.consume("deleteAccount");
    this.deleted = true;
  }
}

function dependencies(store, ownerId = "user-1") {
  return { authenticate: async () => ownerId, store };
}

function jsonRequest(url, body) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("handleArchiveExport requires auth, returns an attachment, and maps failures to 503", async () => {
  const store = new MemoryArchiveRecoveryStore();
  const unauthorized = await handleArchiveExport(dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const response = await handleArchiveExport(dependencies(store));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /attachment; filename="bareaga-archive\.json"/);
  const body = await response.json();
  assert.equal(body.format, "bareaga.archive.export.v1");
  assert.equal(body.archiveId, "archive-1");

  store.failNext.export = new Error("db down");
  const failure = await handleArchiveExport(dependencies(store));
  assert.equal(failure.status, 503);
});

test("handleArchiveRevisions requires auth and returns the revision list", async () => {
  const store = new MemoryArchiveRecoveryStore();
  const unauthorized = await handleArchiveRevisions(dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const response = await handleArchiveRevisions(dependencies(store));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.archiveId, "archive-1");
  assert.equal(body.currentRevision, 0);
  assert.equal(body.revisions.length, 1);

  store.failNext.export = new Error("db down");
  const failure = await handleArchiveRevisions(dependencies(store));
  assert.equal(failure.status, 503);
});

test("handleArchiveRestore validates the request body and maps store errors", async () => {
  const store = new MemoryArchiveRecoveryStore();
  const restoreUrl = "http://localhost/api/archive/revisions";

  const unauthorized = await handleArchiveRestore(jsonRequest(restoreUrl, { revision: 0 }), dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const malformed = await handleArchiveRestore(new Request(restoreUrl, { method: "POST", body: "{not json" }), dependencies(store));
  assert.equal(malformed.status, 400);

  const invalidRevision = await handleArchiveRestore(jsonRequest(restoreUrl, { revision: -1 }), dependencies(store));
  assert.equal(invalidRevision.status, 400);

  const success = await handleArchiveRestore(jsonRequest(restoreUrl, { revision: 0 }), dependencies(store));
  assert.equal(success.status, 200);

  const notFound = await handleArchiveRestore(jsonRequest(restoreUrl, { revision: 99 }), dependencies(store));
  assert.equal(notFound.status, 404);

  store.failNext.restore = new Error("stale revision");
  const conflict = await handleArchiveRestore(jsonRequest(restoreUrl, { revision: 0 }), dependencies(store));
  assert.equal(conflict.status, 409);
});

test("handleContentCapture validates itemId and maps store errors", async () => {
  const store = new MemoryArchiveRecoveryStore();
  const captureUrl = "http://localhost/api/archive/snapshots";

  const unauthorized = await handleContentCapture(jsonRequest(captureUrl, { itemId: "item-1" }), dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const missingItemId = await handleContentCapture(jsonRequest(captureUrl, {}), dependencies(store));
  assert.equal(missingItemId.status, 400);

  const success = await handleContentCapture(jsonRequest(captureUrl, { itemId: "item-1" }), dependencies(store));
  assert.equal(success.status, 201);
  const body = await success.json();
  assert.equal(body.itemId, "item-1");

  const notFound = await handleContentCapture(jsonRequest(captureUrl, { itemId: "missing" }), dependencies(store));
  assert.equal(notFound.status, 404);

  store.failNext.capture = new Error("fetch failed");
  const failure = await handleContentCapture(jsonRequest(captureUrl, { itemId: "item-1" }), dependencies(store));
  assert.equal(failure.status, 422);
});

test("handleContentDownload requires auth, streams the captured body, and 404s on any failure", async () => {
  const store = new MemoryArchiveRecoveryStore();

  const unauthorized = await handleContentDownload("snap-1", dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const response = await handleContentDownload("snap-1", dependencies(store));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain");
  assert.match(response.headers.get("content-disposition"), /filename="snap-1\.txt"/);
  assert.equal(await response.text(), "captured");

  const missing = await handleContentDownload("nope", dependencies(store));
  assert.equal(missing.status, 404);
});

test("handleAccountDelete requires the DELETE confirmation phrase and maps store failures to 503", async () => {
  const store = new MemoryArchiveRecoveryStore();
  const deleteUrl = "http://localhost/api/account";

  const unauthorized = await handleAccountDelete(jsonRequest(deleteUrl, { confirmation: "DELETE" }), dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const wrongConfirmation = await handleAccountDelete(jsonRequest(deleteUrl, { confirmation: "delete" }), dependencies(store));
  assert.equal(wrongConfirmation.status, 400);

  const success = await handleAccountDelete(jsonRequest(deleteUrl, { confirmation: "DELETE" }), dependencies(store));
  assert.equal(success.status, 204);
  assert.equal(store.deleted, true);

  store.failNext.deleteAccount = new Error("storage error");
  const failure = await handleAccountDelete(jsonRequest(deleteUrl, { confirmation: "DELETE" }), dependencies(store));
  assert.equal(failure.status, 503);
});
