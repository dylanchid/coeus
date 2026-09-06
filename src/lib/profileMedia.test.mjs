import assert from "node:assert/strict";
import test from "node:test";

import { avatarInitials, coverSeed, generativeCover } from "./profileMedia.ts";

test("coverSeed is a stable unsigned 32-bit hash of the handle", () => {
  assert.equal(coverSeed("ada"), coverSeed("ada"));
  assert.notEqual(coverSeed("ada"), coverSeed("grace"));
  const seed = coverSeed("dylan");
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
});

test("generativeCover is byte-identical across repeated calls with the same handle", () => {
  assert.equal(generativeCover("ada", 40, 8), generativeCover("ada", 40, 8));
});

test("two different handles produce different covers", () => {
  assert.notEqual(generativeCover("ada", 40, 8), generativeCover("grace", 40, 8));
});

test("output row count and row length match the requested dimensions exactly", () => {
  const rows = generativeCover("ada", 57, 13).split("\n");
  assert.equal(rows.length, 13);
  for (const row of rows) assert.equal(row.length, 57);
});

test("every character is drawn from the ramp", () => {
  const ramp = new Set(" .-:+=*%#");
  for (const char of generativeCover("dylan", 40, 6).replace(/\n/g, "")) {
    assert.ok(ramp.has(char), `unexpected character ${JSON.stringify(char)}`);
  }
});

test("avatarInitials handles one word, two words, extra whitespace and never exceeds two chars", () => {
  assert.equal(avatarInitials("Ada"), "A");
  assert.equal(avatarInitials("Ada Lovelace"), "AL");
  assert.equal(avatarInitials("  Grace   Brewster   Murray Hopper  "), "GH");
  assert.equal(avatarInitials(""), "");
  assert.equal(avatarInitials("   "), "");
  assert.ok(avatarInitials("Jean-Luc Picard").length <= 2);
});

test("avatarInitials tolerates non-Latin input without throwing", () => {
  assert.doesNotThrow(() => avatarInitials("张 伟"));
  assert.doesNotThrow(() => avatarInitials("عبد الله"));
  assert.ok(avatarInitials("张 伟").length <= 2);
});
