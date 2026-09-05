import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionsForDestination,
  isCollectionDestination,
  isShareCancellation,
  resolveCollectionId,
} from "./shareDestination.ts";

const collections = [
  { id: "private", name: "Private", description: "", visibility: "private", kind: "personal", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "public", name: "Public", description: "", visibility: "public", kind: "personal", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "community", name: "Community", description: "", visibility: "public", kind: "community", createdAt: "2026-01-01T00:00:00.000Z" },
];

test("collection destinations expose only valid collection kinds", () => {
  assert.deepEqual(collectionsForDestination(collections, "personal").map(({ id }) => id), ["private"]);
  assert.deepEqual(collectionsForDestination(collections, "public").map(({ id }) => id), ["public"]);
  assert.deepEqual(collectionsForDestination(collections, "community").map(({ id }) => id), ["community"]);
  assert.deepEqual(collectionsForDestination(collections, "friend"), []);
  assert.equal(isCollectionDestination("community"), true);
  assert.equal(isCollectionDestination("social"), false);
});

test("collection resolution never invents a destination", () => {
  assert.equal(resolveCollectionId(collections, "public"), "public");
  assert.equal(resolveCollectionId(collections, "missing"), "private");
  assert.equal(resolveCollectionId([], "missing"), null);
});

test("only AbortError is treated as an expected share cancellation", () => {
  assert.equal(isShareCancellation(new DOMException("Cancelled", "AbortError")), true);
  assert.equal(isShareCancellation(new DOMException("Denied", "NotAllowedError")), false);
  assert.equal(isShareCancellation(new Error("Clipboard failed")), false);
});
