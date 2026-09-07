import assert from "node:assert/strict";
import test from "node:test";

import {
  handleConnectDestination,
  handleDisconnectDestination,
  handleListDeliveries,
  handleListDestinations,
  handleTriggerSync,
} from "./destinationsApi.ts";
import { ArchiveNotFoundError, DestinationNotFoundError } from "./destinationsErrors.ts";

class MemoryDestinationsStore {
  destinations = [];
  deliveriesByKind = new Map();
  failNext = {};

  consume(key) {
    const error = this.failNext[key];
    this.failNext[key] = null;
    return error;
  }

  async list(ownerId) {
    if (this.failNext.list) throw this.consume("list");
    if (ownerId === "no-archive") throw new ArchiveNotFoundError("Archive not found");
    return this.destinations;
  }

  async connect(ownerId, kind, displayName, config) {
    if (this.failNext.connect) throw this.consume("connect");
    const destination = { id: `dest-${kind}`, archiveId: "archive-1", kind, status: "active", displayName, config, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" };
    this.destinations.push(destination);
    return destination;
  }

  async disconnect(_ownerId, kind) {
    if (this.failNext.disconnect) throw this.consume("disconnect");
    const before = this.destinations.length;
    this.destinations = this.destinations.filter((destination) => destination.kind !== kind);
    return this.destinations.length < before;
  }

  async purge(_ownerId, kind) {
    if (this.failNext.purge) throw this.consume("purge");
    const before = this.destinations.length;
    this.destinations = this.destinations.filter((destination) => destination.kind !== kind);
    this.deliveriesByKind.delete(kind);
    return this.destinations.length < before;
  }

  async deliveries(_ownerId, kind) {
    if (this.failNext.deliveries) throw this.consume("deliveries");
    if (!this.deliveriesByKind.has(kind)) throw new DestinationNotFoundError("Destination not found");
    return this.deliveriesByKind.get(kind);
  }
}

function dependencies(store, ownerId = "user-1") {
  return { authenticate: async () => ownerId, store };
}

function jsonRequest(body) {
  return new Request("http://localhost/api/archive/destinations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("handleListDestinations requires auth and maps ArchiveNotFoundError to 404", async () => {
  const store = new MemoryDestinationsStore();
  const unauthorized = await handleListDestinations(dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const ok = await handleListDestinations(dependencies(store));
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).destinations, []);

  const notFound = await handleListDestinations(dependencies(store, "no-archive"));
  assert.equal(notFound.status, 404);

  store.failNext.list = new Error("db down");
  const failure = await handleListDestinations(dependencies(store));
  assert.equal(failure.status, 503);
});

test("handleConnectDestination validates the body and creates a destination", async () => {
  const store = new MemoryDestinationsStore();

  const badJson = await handleConnectDestination(new Request("http://localhost", { method: "POST", body: "{not json" }), dependencies(store));
  assert.equal(badJson.status, 400);

  const badKind = await handleConnectDestination(jsonRequest({ kind: "dropbox" }), dependencies(store));
  assert.equal(badKind.status, 400);

  const missingSecret = await handleConnectDestination(
    jsonRequest({ kind: "obsidian_git", displayName: "My Vault", config: { repo: "acme/vault" } }),
    dependencies(store)
  );
  assert.equal(missingSecret.status, 400);

  const badConfig = await handleConnectDestination(
    jsonRequest({ kind: "obsidian_git", displayName: "My Vault", config: { repo: "not-a-repo" }, secret: "ghp_x" }),
    dependencies(store)
  );
  assert.equal(badConfig.status, 400);

  const success = await handleConnectDestination(
    jsonRequest({ kind: "obsidian_git", displayName: "My Vault", config: { repo: "acme/vault" }, secret: "ghp_x" }),
    dependencies(store)
  );
  assert.equal(success.status, 201);
  const body = await success.json();
  assert.equal(body.kind, "obsidian_git");
  assert.equal(body.config.branch, "main");
  assert.equal(body.secret, undefined);

  store.failNext.connect = new Error("db down");
  const failure = await handleConnectDestination(
    jsonRequest({ kind: "notion", displayName: "Notes", config: { databaseId: "db-1" }, secret: "secret-token" }),
    dependencies(store)
  );
  assert.equal(failure.status, 503);
});

function deleteRequest(purge = false) {
  return new Request(`http://localhost/api/archive/destinations/obsidian_git${purge ? "?purge=1" : ""}`, { method: "DELETE" });
}

test("handleDisconnectDestination validates the kind path segment and reports 404 when nothing was disconnected", async () => {
  const store = new MemoryDestinationsStore();
  await store.connect("user-1", "obsidian_git", "My Vault", { repo: "acme/vault", branch: "main", pathPrefix: "" });

  const unauthorized = await handleDisconnectDestination("obsidian_git", deleteRequest(), dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const unknownKind = await handleDisconnectDestination("dropbox", deleteRequest(), dependencies(store));
  assert.equal(unknownKind.status, 404);

  const success = await handleDisconnectDestination("obsidian_git", deleteRequest(), dependencies(store));
  assert.equal(success.status, 204);

  const alreadyGone = await handleDisconnectDestination("obsidian_git", deleteRequest(), dependencies(store));
  assert.equal(alreadyGone.status, 404);
});

test("handleDisconnectDestination permanently removes the destination when ?purge=1 is set", async () => {
  const store = new MemoryDestinationsStore();
  await store.connect("user-1", "obsidian_git", "My Vault", { repo: "acme/vault", branch: "main", pathPrefix: "" });
  store.deliveriesByKind.set("obsidian_git", [{ destinationId: "dest-obsidian_git", itemId: "item-1", externalRef: "item-1.md", lastDeliveredRevision: 1, status: "delivered", lastAttemptedAt: null, lastError: null, lastHttpStatus: 200 }]);

  const success = await handleDisconnectDestination("obsidian_git", deleteRequest(true), dependencies(store));
  assert.equal(success.status, 204);
  assert.equal(store.destinations.length, 0);
  assert.equal(store.deliveriesByKind.has("obsidian_git"), false);
});

test("handleListDeliveries surfaces a destination's per-item delivery status, distinguishing auth_error from failed_retryable", async () => {
  const store = new MemoryDestinationsStore();
  store.deliveriesByKind.set("notion", [
    { destinationId: "dest-notion", itemId: "item-1", externalRef: "page-1", lastDeliveredRevision: 2, status: "delivered", lastAttemptedAt: "2026-09-05T00:00:00.000Z", lastError: null, lastHttpStatus: 200 },
    { destinationId: "dest-notion", itemId: "item-2", externalRef: null, lastDeliveredRevision: 0, status: "failed_auth", lastAttemptedAt: "2026-09-05T00:01:00.000Z", lastError: "token expired", lastHttpStatus: 401 },
  ]);

  const missing = await handleListDeliveries("notion", dependencies(new MemoryDestinationsStore()));
  assert.equal(missing.status, 404);

  const response = await handleListDeliveries("notion", dependencies(store));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.deliveries.length, 2);
  assert.equal(body.deliveries[1].status, "failed_auth");
  assert.notEqual(body.deliveries[1].status, "failed_retryable");
});

test("handleTriggerSync requires auth, validates kind, and maps runner failures to 503", async () => {
  const calls = [];
  const dependenciesWithRunner = (ownerId = "user-1", shouldThrow = false) => ({
    authenticate: async () => ownerId,
    triggerSync: async (owner, kind) => {
      calls.push([owner, kind]);
      if (shouldThrow) throw new Error("adapter down");
      return { correlationId: "cid-1", processed: 1, skipped: 0 };
    },
  });

  const unauthorized = await handleTriggerSync("obsidian_git", dependenciesWithRunner(null));
  assert.equal(unauthorized.status, 401);

  const unknownKind = await handleTriggerSync("dropbox", dependenciesWithRunner());
  assert.equal(unknownKind.status, 404);

  const accepted = await handleTriggerSync("obsidian_git", dependenciesWithRunner());
  assert.equal(accepted.status, 202);
  assert.deepEqual(await accepted.json(), { correlationId: "cid-1", processed: 1, skipped: 0 });
  assert.deepEqual(calls, [["user-1", "obsidian_git"]]);

  const failure = await handleTriggerSync("obsidian_git", dependenciesWithRunner("user-1", true));
  assert.equal(failure.status, 503);
});
