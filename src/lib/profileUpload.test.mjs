import assert from "node:assert/strict";
import test from "node:test";

import {
  mediaObjectPath,
  objectPathFromPublicUrl,
  sniffImageType,
  validateUpload,
} from "./profileUpload.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);

test("sniffImageType recognises PNG, JPEG and WebP and nothing else", () => {
  assert.equal(sniffImageType(PNG), "image/png");
  assert.equal(sniffImageType(JPEG), "image/jpeg");
  assert.equal(sniffImageType(WEBP), "image/webp");
  assert.equal(sniffImageType(GIF), null);
});

test("validateUpload accepts a well-formed avatar", () => {
  const result = validateUpload({ kind: "avatar", declaredType: "image/png", size: 1024, bytesHead: PNG });
  assert.deepEqual(result, { ok: true, kind: "avatar", type: "image/png" });
});

test("validateUpload rejects an unknown kind", () => {
  const result = validateUpload({ kind: "banner", declaredType: "image/png", size: 1024, bytesHead: PNG });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
});

test("validateUpload rejects a non-image declared type", () => {
  const result = validateUpload({ kind: "avatar", declaredType: "application/pdf", size: 1024, bytesHead: PNG });
  assert.equal(result.ok, false);
  assert.equal(result.status, 415);
});

test("validateUpload rejects a file whose magic bytes disagree with its declared type", () => {
  const result = validateUpload({ kind: "cover", declaredType: "image/png", size: 1024, bytesHead: JPEG });
  assert.equal(result.ok, false);
  assert.equal(result.status, 415);
  assert.match(result.error, /do not match/);
});

test("validateUpload rejects a file whose contents are not an image at all", () => {
  const result = validateUpload({ kind: "avatar", declaredType: "image/png", size: 1024, bytesHead: GIF });
  assert.equal(result.ok, false);
  assert.equal(result.status, 415);
});

test("validateUpload enforces the per-kind size cap", () => {
  assert.equal(validateUpload({ kind: "avatar", declaredType: "image/png", size: 2 * 1024 * 1024 + 1, bytesHead: PNG }).ok, false);
  assert.equal(validateUpload({ kind: "cover", declaredType: "image/png", size: 2 * 1024 * 1024 + 1, bytesHead: PNG }).ok, true);
  assert.equal(validateUpload({ kind: "cover", declaredType: "image/png", size: 5 * 1024 * 1024 + 1, bytesHead: PNG }).ok, false);
  const tooBig = validateUpload({ kind: "avatar", declaredType: "image/png", size: 9_000_000, bytesHead: PNG });
  assert.equal(tooBig.status, 413);
});

test("validateUpload rejects an empty upload", () => {
  assert.equal(validateUpload({ kind: "avatar", declaredType: "image/png", size: 0, bytesHead: PNG }).ok, false);
});

test("mediaObjectPath writes under the uid prefix with a random token and the right extension", () => {
  const path = mediaObjectPath("uid-123", "avatar", "image/jpeg", "abc-DEF-987-ghi-jkl-mno");
  assert.match(path, /^uid-123\/avatar-[a-zA-Z0-9]{1,16}\.jpg$/);
  assert.notEqual(
    mediaObjectPath("uid-123", "avatar", "image/png", "aaaa"),
    mediaObjectPath("uid-123", "avatar", "image/png", "bbbb")
  );
});

test("objectPathFromPublicUrl only returns a path inside the caller's own prefix", () => {
  const base = "http://localhost:54321/storage/v1/object/public/profile-media/";
  assert.equal(objectPathFromPublicUrl(`${base}uid-1/avatar-x.png`, "uid-1"), "uid-1/avatar-x.png");
  assert.equal(objectPathFromPublicUrl(`${base}uid-2/avatar-x.png`, "uid-1"), null);
  assert.equal(objectPathFromPublicUrl("https://evil.example/uid-1/avatar.png", "uid-1"), null);
  assert.equal(objectPathFromPublicUrl(null, "uid-1"), null);
  assert.equal(objectPathFromPublicUrl(`${base}uid-1/avatar-x.png?token=abc`, "uid-1"), "uid-1/avatar-x.png");
});
