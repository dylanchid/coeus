import assert from "node:assert/strict";
import test from "node:test";

import { removeStoragePrefix } from "./storageCleanup.ts";

class MemoryBucket {
  files;
  removed = [];
  failList = false;
  failRemove = false;

  constructor(files) { this.files = new Set(files); }

  async list(path, { limit, offset }) {
    if (this.failList) return { data: null, error: new Error("list failed") };
    const prefix = `${path}/`;
    const children = new Map();
    for (const file of this.files) {
      if (!file.startsWith(prefix)) continue;
      const rest = file.slice(prefix.length);
      const name = rest.split("/")[0];
      children.set(name, { name, id: rest.includes("/") ? null : `id-${file}` });
    }
    return { data: [...children.values()].slice(offset, offset + limit), error: null };
  }

  async remove(paths) {
    if (this.failRemove) return { error: new Error("remove failed") };
    for (const path of paths) { this.files.delete(path); this.removed.push(path); }
    return { error: null };
  }
}

test("removeStoragePrefix deletes nested, replaced, and orphaned objects only under its prefix", async () => {
  const bucket = new MemoryBucket([
    "user-1/avatar-current.png", "user-1/cover-old.jpg", "user-1/nested/orphan.webp",
    "user-2/avatar.png", "unrelated/file.txt",
  ]);
  await removeStoragePrefix(bucket, "user-1");
  assert.deepEqual([...bucket.files].sort(), ["unrelated/file.txt", "user-2/avatar.png"]);
  assert.deepEqual(bucket.removed.sort(), ["user-1/avatar-current.png", "user-1/cover-old.jpg", "user-1/nested/orphan.webp"]);
});

test("removeStoragePrefix handles empty prefixes and fails before a caller can delete the account", async () => {
  const empty = new MemoryBucket([]);
  await removeStoragePrefix(empty, "user-1");
  assert.deepEqual(empty.removed, []);

  const failing = new MemoryBucket(["user-1/avatar.png"]);
  failing.failRemove = true;
  await assert.rejects(removeStoragePrefix(failing, "user-1"), /remove failed/);
  assert.deepEqual([...failing.files], ["user-1/avatar.png"]);
});
