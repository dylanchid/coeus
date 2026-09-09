import assert from "node:assert/strict";
import test from "node:test";

import { handleUploadProfileMedia } from "./profileMediaApi.ts";

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngFile(bytes = 2048, type = "image/png") {
  const body = new Uint8Array(bytes);
  body.set(PNG_HEAD, 0);
  return new File([body], "pic.png", { type });
}

function jpegLyingFile() {
  const body = new Uint8Array(2048);
  body.set([0xff, 0xd8, 0xff], 0); // JPEG magic
  return new File([body], "pic.png", { type: "image/png" }); // ...but declared PNG
}

function upload(form) {
  return new Request("https://coeus.test/api/account/profile/media", { method: "POST", body: form });
}

function form({ file, kind }) {
  const fd = new FormData();
  if (file) fd.set("file", file);
  if (kind !== undefined) fd.set("kind", kind);
  return fd;
}

class FakeStorage {
  uploaded = [];
  removed = [];
  async upload(path, body, contentType) {
    this.uploaded.push({ path, size: body.byteLength, contentType });
  }
  async remove(paths) {
    this.removed.push(...paths);
  }
  publicUrl(path) {
    return `http://localhost:54321/storage/v1/object/public/profile-media/${path}`;
  }
}

function deps(overrides = {}) {
  return {
    authenticate: async () => "user-1",
    storage: new FakeStorage(),
    currentMedia: async () => ({ avatarUrl: null, coverUrl: null }),
    randomToken: () => "tok123",
    ...overrides,
  };
}

test("rejects an unauthenticated caller with 401", async () => {
  const response = await handleUploadProfileMedia(upload(form({ file: pngFile(), kind: "avatar" })), deps({ authenticate: async () => null }));
  assert.equal(response.status, 401);
});

test("stores a valid avatar under the caller's uid prefix and returns its url", async () => {
  const d = deps();
  const response = await handleUploadProfileMedia(upload(form({ file: pngFile(), kind: "avatar" })), d);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.url, "http://localhost:54321/storage/v1/object/public/profile-media/user-1/avatar-tok123.png");
  assert.equal(d.storage.uploaded[0].path, "user-1/avatar-tok123.png");
});

test("rejects a non-image declared type", async () => {
  const file = new File([new Uint8Array(10)], "x.pdf", { type: "application/pdf" });
  const response = await handleUploadProfileMedia(upload(form({ file, kind: "avatar" })), deps());
  assert.equal(response.status, 415);
});

test("rejects a file whose magic bytes disagree with its declared type", async () => {
  const response = await handleUploadProfileMedia(upload(form({ file: jpegLyingFile(), kind: "cover" })), deps());
  assert.equal(response.status, 415);
});

test("rejects an over-size avatar (cap is 2 MB)", async () => {
  const response = await handleUploadProfileMedia(upload(form({ file: pngFile(2 * 1024 * 1024 + 1), kind: "avatar" })), deps());
  assert.equal(response.status, 413);
});

test("rejects an over-size cover before decoding the body (cap is 5 MB) — F-28", async () => {
  const d = deps();
  const response = await handleUploadProfileMedia(upload(form({ file: pngFile(5 * 1024 * 1024 + 1), kind: "cover" })), d);
  assert.equal(response.status, 413);
  assert.deepEqual(d.storage.uploaded, []);
});

test("rejects on an oversized Content-Length before the body is parsed — F-28", async () => {
  const request = new Request("https://coeus.test/api/account/profile/media", {
    method: "POST",
    body: "not even multipart",
    headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(50 * 1024 * 1024) },
  });
  const d = deps();
  const response = await handleUploadProfileMedia(request, d);
  assert.equal(response.status, 413);
  assert.deepEqual(d.storage.uploaded, []);
});

test("rejects an unknown kind", async () => {
  const response = await handleUploadProfileMedia(upload(form({ file: pngFile(), kind: "banner" })), deps());
  assert.equal(response.status, 422);
});

test("removes the previously stored file for that kind, only inside the caller's prefix", async () => {
  const d = deps({
    currentMedia: async () => ({
      avatarUrl: "http://localhost:54321/storage/v1/object/public/profile-media/user-1/avatar-old.png",
      coverUrl: null,
    }),
  });
  await handleUploadProfileMedia(upload(form({ file: pngFile(), kind: "avatar" })), d);
  assert.deepEqual(d.storage.removed, ["user-1/avatar-old.png"]);
});

test("a previous url pointing at another account's prefix is never deleted", async () => {
  const d = deps({
    currentMedia: async () => ({
      avatarUrl: "http://localhost:54321/storage/v1/object/public/profile-media/user-2/avatar-old.png",
      coverUrl: null,
    }),
  });
  await handleUploadProfileMedia(upload(form({ file: pngFile(), kind: "avatar" })), d);
  assert.deepEqual(d.storage.removed, []);
});

test("a cleanup failure does not fail the upload", async () => {
  const storage = new FakeStorage();
  storage.remove = async () => {
    throw new Error("network");
  };
  const d = deps({
    storage,
    currentMedia: async () => ({
      avatarUrl: "http://localhost:54321/storage/v1/object/public/profile-media/user-1/avatar-old.png",
      coverUrl: null,
    }),
  });
  const response = await handleUploadProfileMedia(upload(form({ file: pngFile(), kind: "avatar" })), d);
  assert.equal(response.status, 200);
});
