import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseCss = readFileSync(join(root, "styles/base.css"), "utf8");
const publicCollectionCss = readFileSync(join(root, "styles/public-collection.css"), "utf8");
const profileCss = readFileSync(join(root, "styles/profile.css"), "utf8");

const ROOT_REQUIRED = [
  "--font-mono:",
  "--font-public-title:",
  "--text-index:",
  "--rule-group:",
  "--accent-band:",
  "--accent-band-ink:",
  "--tint-published:",
];

function rootBlock(css) {
  const match = css.match(/:root\s*\{([^}]+)\}/);
  assert.ok(match, ":root block missing");
  return match[1];
}

function definedCustomProperties(css) {
  const names = new Set();
  for (const match of css.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)) {
    names.add(`--${match[1]}`);
  }
  return names;
}

function varsUsedIn(css) {
  const used = new Set();
  for (const match of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    used.add(match[1]);
  }
  return used;
}

const SEMANTIC_ALIASES = new Set([
  "--surface-page",
  "--surface-raised",
  "--surface-inverse",
  "--text-primary",
  "--text-secondary",
  "--text-inverse",
  "--text-accent",
  "--text-link",
  "--text-visited",
  "--text-danger",
  "--rule-subtle",
  "--rule-strong",
  "--rule-panel",
  "--focus-ring",
  "--highlight",
  "--text-kicker",
]);

test("look-1 tokens are declared on :root", () => {
  const block = rootBlock(baseCss);
  for (const token of ROOT_REQUIRED) {
    assert.match(block, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(block, /--handle:\s*var\(--muted\)/);
});

test("base.css never sets --handle to a hex colour", () => {
  assert.doesNotMatch(baseCss, /--handle:\s*#/);
});

test("public pin selector lists all four public page classes", () => {
  const pin = baseCss.slice(baseCss.indexOf("Public look pin"));
  for (const className of [
    ".public-collection-page",
    ".profile-page",
    ".about-page",
    ".signin-page",
  ]) {
    assert.match(pin, new RegExp(className.replace(".", "\\.")));
  }
});

test("public-collection.css defines no selector-level custom properties", () => {
  assert.doesNotMatch(publicCollectionCss, /^\s*--[a-zA-Z0-9-]+\s*:/m);
});

test("every var() in public-collection.css and profile.css resolves in base.css", () => {
  const defined = definedCustomProperties(baseCss);
  for (const fileCss of [publicCollectionCss, profileCss]) {
    for (const name of varsUsedIn(fileCss)) {
      const ok = defined.has(name) || SEMANTIC_ALIASES.has(name);
      assert.ok(ok, `${name} used but not defined in base.css`);
    }
  }
});