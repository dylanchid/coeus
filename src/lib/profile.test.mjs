import assert from "node:assert/strict";
import test from "node:test";

import { BIO_MAX, DISPLAY_NAME_MAX, normalizeHandle, validateProfileInput } from "./profile.ts";

test("normalizeHandle lowercases and trims so equivalent handles collide", () => {
  assert.equal(normalizeHandle("  Ada_L "), "ada_l");
});

test("a well-formed profile validates and returns the normalized value", () => {
  const result = validateProfileInput({ handle: " Ada_L ", displayName: "  Ada Lovelace  ", bio: "  Countess of computing  " });
  assert.deepEqual(result, { ok: true, value: { handle: "ada_l", displayName: "Ada Lovelace", bio: "Countess of computing" } });
});

test("an empty bio is stored as null, not an empty string", () => {
  const result = validateProfileInput({ handle: "ada", displayName: "Ada", bio: "   " });
  assert.equal(result.ok, true);
  assert.equal(result.value.bio, null);
});

test("rejects handles that do not match the storable shape", () => {
  for (const handle of ["ab", "a".repeat(21), "has space", "dash-no", "emoji🔥"]) {
    const result = validateProfileInput({ handle, displayName: "Fine" });
    assert.equal(result.ok, false, `expected "${handle}" to be rejected`);
    assert.ok(result.errors.handle);
  }
});

test("uppercase handle input is accepted, lowercased", () => {
  const result = validateProfileInput({ handle: "AdaLovelace", displayName: "Ada" });
  assert.equal(result.ok, true);
  assert.equal(result.value.handle, "adalovelace");
});

test("requires a display name and caps its length", () => {
  assert.equal(validateProfileInput({ handle: "ada", displayName: "   " }).ok, false);
  const long = validateProfileInput({ handle: "ada", displayName: "x".repeat(DISPLAY_NAME_MAX + 1) });
  assert.equal(long.ok, false);
  assert.ok(long.errors.displayName);
});

test("caps the bio length", () => {
  const result = validateProfileInput({ handle: "ada", displayName: "Ada", bio: "x".repeat(BIO_MAX + 1) });
  assert.equal(result.ok, false);
  assert.ok(result.errors.bio);
});

test("reports every invalid field at once", () => {
  const result = validateProfileInput({ handle: "!", displayName: "", bio: "x".repeat(BIO_MAX + 1) });
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["bio", "displayName", "handle"]);
});

test("ignores non-string input without throwing", () => {
  const result = validateProfileInput({ handle: 42, displayName: null, bio: {} });
  assert.equal(result.ok, false);
  assert.ok(result.errors.handle && result.errors.displayName);
});
