import assert from "node:assert/strict";
import test from "node:test";

import { createDemoArchive, createEmptyArchive, stripUntouchedDemoContent } from "./archiveFixtures.ts";
import { migrateArchiveData } from "./archiveValidation.ts";
import { LocalStorageArchiveRepository } from "./localArchiveRepository.ts";

function memoryStorage(initial) {
  const values = new Map(initial ? [["coeus.archive.v1", initial]] : []);
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    value(key) { return values.get(key); },
  };
}

test("archive migration fills legacy collection kind and social posts", () => {
  const legacy = createDemoArchive();
  delete legacy.socialPosts;
  delete legacy.collections[0].kind;
  const result = migrateArchiveData(legacy);
  assert.equal(result.valid, true);
  assert.equal(result.migrated, true);
  assert.deepEqual(result.data.socialPosts, []);
  assert.equal(result.data.collections[0].kind, "personal");
});

test("a snapshot with a legacy \"friends\" audience parses and normalises to \"followers\"", () => {
  // TOLERANT READ, MIGRATE ON WRITE. Existing archive_revisions snapshots carry
  // audience: "friends" from the old mutuals model. The validator must accept
  // it, hand every caller "followers", and flag the result migrated so the next
  // save drains the legacy value. This assertion cannot be removed until the
  // corpus no longer contains "friends".
  const legacy = createDemoArchive();
  legacy.socialPosts[0].audience = "friends";
  const result = migrateArchiveData(legacy);
  assert.equal(result.valid, true);
  assert.equal(result.migrated, true);
  assert.equal(result.data.socialPosts[0].audience, "followers");
});

test("a snapshot with an unknown audience value is still rejected", () => {
  const legacy = createDemoArchive();
  legacy.socialPosts[0].audience = "enemies";
  assert.equal(migrateArchiveData(legacy).valid, false);
});

test("collection visibility \"followers\" is accepted", () => {
  const legacy = createDemoArchive();
  legacy.collections[0].visibility = "followers";
  const result = migrateArchiveData(legacy);
  assert.equal(result.valid, true);
  assert.equal(result.data.collections[0].visibility, "followers");
});

test("a valid snapshot with modern audience values is not flagged migrated", () => {
  const result = migrateArchiveData(createDemoArchive());
  assert.equal(result.valid, true);
  assert.equal(result.migrated, false);
});

test("archive validation rejects malformed persisted records", () => {
  const malformed = createDemoArchive();
  malformed.items[0].url = "javascript:alert(1)";
  const result = migrateArchiveData(malformed);
  assert.equal(result.valid, false);
  // The fallback is an empty archive, never demo content.
  assert.deepEqual(result.data.items, []);
  assert.deepEqual(result.data.socialPosts, []);
});

test("local repository persists migrated data and refuses invalid writes", async () => {
  const legacy = createDemoArchive();
  delete legacy.socialPosts;
  const storage = memoryStorage(JSON.stringify(legacy));
  const repository = new LocalStorageArchiveRepository(storage);
  const loaded = await repository.load();
  assert.deepEqual(loaded.socialPosts, []);
  assert.deepEqual(JSON.parse(storage.value("coeus.archive.v1")).socialPosts, []);

  const invalid = { ...loaded, items: [{ nope: true }] };
  await assert.rejects(repository.save(invalid), /invalid archive data/);
});

test("a first-time visitor's archive starts empty with only an Inbox", async () => {
  const storage = memoryStorage(null);
  const loaded = await new LocalStorageArchiveRepository(storage).load();
  assert.deepEqual(loaded.items, []);
  assert.deepEqual(loaded.socialPosts, []);
  assert.deepEqual(loaded.collections.map(({ id }) => id), ["inbox"]);
  assert.deepEqual(JSON.parse(storage.value("coeus.archive.v1")), createEmptyArchive());
});

test("previously seeded demo content is stripped on load, keeping anything the visitor touched", async () => {
  const seeded = createDemoArchive();
  seeded.items[0].note = "my own note";
  const mine = { ...seeded.items[1], id: "mine-1", articleId: "mine-1", collectionIds: ["inbox"] };
  seeded.items.push(mine);
  const storage = memoryStorage(JSON.stringify(seeded));
  const loaded = await new LocalStorageArchiveRepository(storage).load();

  assert.deepEqual(loaded.socialPosts, [], "fixture posts by invented people always go");
  assert.deepEqual(loaded.items.map(({ id }) => id).sort(), [seeded.items[0].id, "mine-1"].sort());
  const keptCollections = new Set(loaded.collections.map(({ id }) => id));
  assert.ok(keptCollections.has("inbox"));
  for (const id of seeded.items[0].collectionIds) assert.ok(keptCollections.has(id), "a touched item keeps its collection");
  assert.ok(!keptCollections.has("open-web-notes"), "an untouched, empty demo collection goes");
  assert.deepEqual(JSON.parse(storage.value("coeus.archive.v1")), loaded, "the cleanup is persisted");
});

test("stripping is a no-op (same reference) for an archive with no demo content", () => {
  const archive = createEmptyArchive();
  assert.equal(stripUntouchedDemoContent(archive), archive);
});
