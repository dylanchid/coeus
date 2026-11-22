import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATED_MARKER,
  VAULT_DOC_MANIFEST,
  transformForRepo,
} from "./vaultSync.ts";

const prd = VAULT_DOC_MANIFEST.find((entry) => entry.vault === "PRD.md");
const ux = VAULT_DOC_MANIFEST.find((entry) => entry.vault === "ux/README.md");
const notes = VAULT_DOC_MANIFEST.find((entry) => entry.vault === "Coeus.md");

test("manifest has unique vault and repo paths, all under docs/", () => {
  assert.equal(new Set(VAULT_DOC_MANIFEST.map((e) => e.vault)).size, VAULT_DOC_MANIFEST.length);
  assert.equal(new Set(VAULT_DOC_MANIFEST.map((e) => e.repo)).size, VAULT_DOC_MANIFEST.length);
  for (const entry of VAULT_DOC_MANIFEST) assert.match(entry.repo, /^docs\/.+\.md$/);
});

test("stamps the generated banner above the content", () => {
  const out = transformForRepo("# Title\n\nBody\n", prd);
  assert.ok(out.startsWith(`<!-- ${GENERATED_MARKER} (Work/Coeus/PRD.md)`));
  assert.ok(out.endsWith("# Title\n\nBody\n"));
});

test("keeps frontmatter first, banner after it", () => {
  const out = transformForRepo("---\npage-width: 927\n---\nHello\n", notes);
  assert.ok(out.startsWith("---\npage-width: 927\n---\n<!-- GENERATED"));
  assert.ok(out.endsWith("\n\nHello\n"));
});

test("strips %% private comments %% including multi-line ones", () => {
  const out = transformForRepo("keep\n%% secret\nacross lines %%\nalso keep\n", prd);
  assert.ok(!out.includes("secret"));
  assert.ok(out.includes("keep"));
  assert.ok(out.includes("also keep"));
});

test("wikilinks to synced notes become relative links", () => {
  assert.ok(transformForRepo("See [[PRD]].", ux).includes("[PRD](../PRD.md)"));
  assert.ok(transformForRepo("See [[PRD|the spec]].", notes).includes("[the spec](PRD.md)"));
  // `Coeus` is the vault name of docs/product-notes.md.
  assert.ok(transformForRepo("See [[Coeus]].", prd).includes("[Coeus](product-notes.md)"));
  assert.ok(transformForRepo("[[PRD#6. Surfaces]]", notes).includes("[PRD#6. Surfaces](PRD.md)"));
});

test("wikilinks to vault-only notes degrade to plain text", () => {
  const out = transformForRepo("[[Coeus.canvas]] and [[SDD|the SDD]]", prd);
  assert.ok(out.includes("Coeus.canvas and the SDD"));
  assert.ok(!out.includes("[["));
});

test("a note linking to itself does not self-link", () => {
  const out = transformForRepo("[[PRD]]", prd);
  assert.ok(out.endsWith("\n\nPRD\n"));
});

test("embeds become a visible placeholder", () => {
  const out = transformForRepo("![[Screenshot 1.png|425]]", prd);
  assert.ok(out.includes("*(vault embed: Screenshot 1.png)*"));
});

test("leaves wikilink-looking text in code untouched", () => {
  const src = "Use `[[PRD]]` or:\n\n```\n[[PRD]]\n```\n";
  const out = transformForRepo(src, ux);
  assert.ok(out.includes("`[[PRD]]`"));
  assert.ok(out.includes("```\n[[PRD]]\n```"));
});

test("is idempotent on already-converted output apart from the banner", () => {
  const once = transformForRepo("# T\n\n[[PRD]]\n", ux);
  const body = once.split("\n\n").slice(1).join("\n\n");
  assert.equal(transformForRepo(body, ux), once);
});
