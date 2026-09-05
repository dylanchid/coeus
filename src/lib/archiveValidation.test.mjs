import assert from "node:assert/strict";
import test from "node:test";

import { createDemoArchive } from "./archiveFixtures.ts";
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

test("archive validation rejects malformed persisted records", () => {
  const malformed = createDemoArchive();
  malformed.items[0].url = "javascript:alert(1)";
  const result = migrateArchiveData(malformed);
  assert.equal(result.valid, false);
  assert.ok(result.data.items.length > 0);
  assert.match(result.data.items[0].url, /^https:/);
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
