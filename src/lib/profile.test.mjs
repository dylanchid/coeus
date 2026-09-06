import assert from "node:assert/strict";
import test from "node:test";

import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  LOCATION_MAX,
  normalizeHandle,
  normalizePinnedSlugs,
  validateProfileInput,
  validateProfileLinks,
} from "./profile.ts";

const EMPTY_SURFACE = {
  location: null,
  links: [],
  avatarUrl: null,
  coverUrl: null,
  pinnedCollectionSlugs: [],
};

test("normalizeHandle lowercases and trims so equivalent handles collide", () => {
  assert.equal(normalizeHandle("  Ada_L "), "ada_l");
});

test("a well-formed profile validates and returns the normalized value", () => {
  const result = validateProfileInput({ handle: " Ada_L ", displayName: "  Ada Lovelace  ", bio: "  Countess of computing  " });
  assert.deepEqual(result, {
    ok: true,
    value: { handle: "ada_l", displayName: "Ada Lovelace", bio: "Countess of computing", ...EMPTY_SURFACE },
  });
});

test("an empty bio is stored as null, not an empty string", () => {
  const result = validateProfileInput({ handle: "ada", displayName: "Ada", bio: "   " });
  assert.equal(result.ok, true);
  assert.equal(result.value.bio, null);
});

test("an omitted or empty links array normalises to [] the way an empty bio normalises to null", () => {
  const omitted = validateProfileInput({ handle: "ada", displayName: "Ada" });
  assert.equal(omitted.ok, true);
  assert.deepEqual(omitted.value.links, []);
  const empty = validateProfileInput({ handle: "ada", displayName: "Ada", links: [] });
  assert.deepEqual(empty.value.links, []);
});

test("validateProfileLinks caps the count, checks shape and requires an http(s) scheme", () => {
  assert.equal(validateProfileLinks("nope").ok, false);
  assert.equal(validateProfileLinks([{ label: "a" }]).ok, false);
  assert.equal(validateProfileLinks([{ label: "", url: "https://a.example" }]).ok, false);
  assert.equal(validateProfileLinks([{ label: "a", url: "ftp://a.example" }]).ok, false);
  assert.equal(
    validateProfileLinks(Array.from({ length: 6 }, (_, i) => ({ label: `l${i}`, url: `https://${i}.example` }))).ok,
    false
  );
  const ok = validateProfileLinks([{ label: "  Site  ", url: "  https://ada.example  " }]);
  assert.deepEqual(ok, { ok: true, value: [{ label: "Site", url: "https://ada.example" }] });
});

test("validateProfileInput surfaces a bad links array as errors.links", () => {
  const result = validateProfileInput({ handle: "ada", displayName: "Ada", links: [{ label: "x" }] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.links);
});

test("validateProfileInput caps location length and stores an empty location as null", () => {
  assert.equal(validateProfileInput({ handle: "ada", displayName: "Ada", location: "   " }).value.location, null);
  const long = validateProfileInput({ handle: "ada", displayName: "Ada", location: "x".repeat(LOCATION_MAX + 1) });
  assert.equal(long.ok, false);
  assert.ok(long.errors.location);
});

test("normalizePinnedSlugs trims, lowercases, drops non-slugs and dedupes", () => {
  assert.deepEqual(normalizePinnedSlugs(["  Ada-Notes ", "ada-notes", "bad slug", "second"]), ["ada-notes", "second"]);
  assert.deepEqual(normalizePinnedSlugs("nope"), []);
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
