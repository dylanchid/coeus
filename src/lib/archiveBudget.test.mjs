import assert from "node:assert/strict";
import test from "node:test";

import { ARCHIVE_BUDGET, checkArchiveBudget } from "./archiveBudget.ts";
import { createDemoArchive } from "./archiveFixtures.ts";
import { createInitialSyncSnapshot } from "./archiveSync.ts";

const DEMO_ITEM = createDemoArchive().items[0];

function item(id, overrides = {}) {
  return { ...structuredClone(DEMO_ITEM), id, ...overrides };
}

function snapshotWith({ items, collections = [], socialPosts = [] } = {}) {
  return createInitialSyncSnapshot(
    { version: 1, items: items ?? [item("a")], collections, socialPosts },
    "2026-09-07T00:00:00.000Z"
  );
}

const TINY_BUDGET = { ...ARCHIVE_BUDGET, maxItems: 2, maxCollections: 1, maxStringFieldChars: 20, maxSnapshotBytes: 400 };

test("a within-budget snapshot has no violation", () => {
  assert.equal(checkArchiveBudget(snapshotWith({ items: [item("a")] })), null);
});

test("too many items is reported with the limit and actual count", () => {
  const violation = checkArchiveBudget(snapshotWith({ items: [item("a"), item("b"), item("c")] }), TINY_BUDGET);
  assert.equal(violation.code, "items");
  assert.equal(violation.limit, 2);
  assert.equal(violation.actual, 3);
});

test("an over-length string field is reported with its path", () => {
  const violation = checkArchiveBudget(snapshotWith({ items: [item("a", { title: "x".repeat(50) })] }), TINY_BUDGET);
  assert.equal(violation.code, "string_field");
  assert.match(violation.message, /a\.title/);
});

test("an oversized serialized snapshot is reported in bytes", () => {
  const big = { ...ARCHIVE_BUDGET, maxSnapshotBytes: 50 };
  const violation = checkArchiveBudget(snapshotWith({ items: [item("a")] }), big);
  assert.equal(violation.code, "snapshot_bytes");
  assert.ok(violation.actual > 50);
});

test("entity-count checks run before the byte check", () => {
  const violation = checkArchiveBudget(
    snapshotWith({ items: [item("a"), item("b"), item("c")] }),
    { ...TINY_BUDGET, maxSnapshotBytes: 1 }
  );
  assert.equal(violation.code, "items");
});
