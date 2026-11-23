import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});

Object.assign(globalThis, {
  window: dom.window,
  localStorage: dom.window.localStorage,
});

const STORAGE_KEY = "coeus.prefs.v1";
const LEGACY_BAREAGA_STORAGE_KEY = "bareaga.prefs.v1";
const LEGACY_STORAGE_KEY = "brp.prefs.v1";

const { getPrefsStore } = await import("@/lib/prefs");
const { DEFAULT_ENABLED_SOURCE_IDS, LEGACY_DEFAULT_SOURCE_IDS } = await import(
  "@/lib/feeds/sources"
);

const legacyOrder = [...LEGACY_DEFAULT_SOURCE_IDS];
const freshOrder = [...DEFAULT_ENABLED_SOURCE_IDS];

beforeEach(() => {
  localStorage.clear();
});

test("empty storage loads the culture-first starter set and does not write", async () => {
  const prefs = await getPrefsStore().load();
  assert.deepEqual(prefs.sourceOrder, freshOrder);
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
  assert.equal(localStorage.getItem(LEGACY_BAREAGA_STORAGE_KEY), null);
  assert.equal(localStorage.getItem(LEGACY_STORAGE_KEY), null);
});

test("stored v1 sourceOrder is returned unchanged", async () => {
  const stored = ["printmag", "hn", "aeon"];
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, theme: "dark", sourceOrder: stored })
  );

  const prefs = await getPrefsStore().load();
  assert.deepEqual(prefs.sourceOrder, stored);
  assert.equal(prefs.theme, "dark");
  assert.equal(localStorage.getItem(STORAGE_KEY), JSON.stringify({
    version: 1,
    theme: "dark",
    sourceOrder: stored,
  }));
});

test("an explicit empty v1 sourceOrder stays empty", async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, sourceOrder: [] })
  );

  const prefs = await getPrefsStore().load();
  assert.deepEqual(prefs.sourceOrder, []);
});

test("v1 prefs with a non-array sourceOrder keep the legacy starter set", async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, sourceOrder: "hn" })
  );

  const prefs = await getPrefsStore().load();
  assert.deepEqual(prefs.sourceOrder, legacyOrder);
});

test("v1 prefs without sourceOrder keep the legacy starter set", async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, theme: "dark", palette: "rose" })
  );

  const prefs = await getPrefsStore().load();
  assert.deepEqual(prefs.sourceOrder, legacyOrder);
  assert.equal(prefs.theme, "dark");
  assert.equal(prefs.palette, "rose");
  assert.equal(
    localStorage.getItem(STORAGE_KEY),
    JSON.stringify({ version: 1, theme: "dark", palette: "rose" })
  );
});

test("a legacy bareaga key keeps the legacy starter set", async () => {
  localStorage.setItem(
    LEGACY_BAREAGA_STORAGE_KEY,
    JSON.stringify({ theme: "dark", sourceOrder: ["aeon", "hn"] })
  );

  const prefs = await getPrefsStore().load();
  assert.deepEqual(prefs.sourceOrder, legacyOrder);
  const migrated = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  assert.deepEqual(migrated.sourceOrder, legacyOrder);
});

test("a legacy brp key keeps the legacy starter set", async () => {
  localStorage.setItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify({ version: 0, sourceOrder: ["quantamagazine"] })
  );

  const prefs = await getPrefsStore().load();
  assert.deepEqual(prefs.sourceOrder, legacyOrder);
  const migrated = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  assert.deepEqual(migrated.sourceOrder, legacyOrder);
});

test("corrupt stored JSON keeps the legacy starter set", async () => {
  localStorage.setItem(STORAGE_KEY, "{");

  const prefs = await getPrefsStore().load();
  assert.deepEqual(prefs.sourceOrder, legacyOrder);
  assert.equal(localStorage.getItem(STORAGE_KEY), "{");
});
