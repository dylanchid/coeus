import assert from "node:assert/strict";
import test from "node:test";

import { VISIBILITY_GLYPHS, visibilityChoices } from "./profileVisibilityGlyph.ts";
import { VISIBILITIES } from "./visibility.ts";

test("every visibility tier maps to a non-empty glyph and label", () => {
  for (const visibility of VISIBILITIES) {
    const entry = VISIBILITY_GLYPHS[visibility];
    assert.ok(entry, `missing entry for ${visibility}`);
    assert.equal(typeof entry.glyph, "string");
    assert.ok(entry.glyph.length > 0);
    assert.ok(entry.label.length > 0);
  }
});

test("the four glyphs are visually distinct", () => {
  const glyphs = VISIBILITIES.map((visibility) => VISIBILITY_GLYPHS[visibility].glyph);
  assert.equal(new Set(glyphs).size, 4);
});

test("each label carries a real word, not just the glyph — it reads without colour", () => {
  for (const visibility of VISIBILITIES) {
    assert.match(VISIBILITY_GLYPHS[visibility].label, /[A-Za-z]{3,}/);
  }
});

test("visibilityChoices returns the four tiers in enum order", () => {
  assert.deepEqual(
    visibilityChoices().map((choice) => choice.value),
    ["private", "followers", "unlisted", "public"]
  );
});

test("visibilityChoices carries the glyph and label for each value", () => {
  for (const choice of visibilityChoices()) {
    assert.equal(choice.glyph, VISIBILITY_GLYPHS[choice.value].glyph);
    assert.equal(choice.label, VISIBILITY_GLYPHS[choice.value].label);
  }
});
