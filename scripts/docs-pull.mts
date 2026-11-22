/**
 * Pull the product docs from the Obsidian vault into `docs/`.
 *
 *   npm run docs:pull      write/refresh the generated copies
 *   npm run docs:check     exit 1 if any copy has drifted from the vault
 *
 * The vault is the source of truth for the files in VAULT_DOC_MANIFEST
 * (src/lib/docs/vaultSync.ts); the repo copies are generated and committed so
 * CI, agents, and fresh clones don't need the vault. See docs/README.md.
 *
 * Vault location (the `Work/Coeus` folder), first match wins:
 *   1. COEUS_VAULT_DIR env var
 *   2. first line of the gitignored `.docs-vault` file in the repo root
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { VAULT_DOC_MANIFEST, transformForRepo } from "../src/lib/docs/vaultSync.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

function resolveVaultDir(): string {
  const fromEnv = process.env.COEUS_VAULT_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  const pointer = join(repoRoot, ".docs-vault");
  if (existsSync(pointer)) {
    const line = readFileSync(pointer, "utf8").split("\n")[0]?.trim();
    if (line) return resolve(line);
  }
  console.error(
    "docs-pull: vault folder not configured.\n" +
      "Set COEUS_VAULT_DIR, or put the path of the vault's Work/Coeus folder on the\n" +
      "first line of .docs-vault in the repo root (gitignored).",
  );
  process.exit(2);
}

const vaultDir = resolveVaultDir();
if (!existsSync(vaultDir)) {
  console.error(`docs-pull: vault folder not found: ${vaultDir}`);
  process.exit(2);
}

const missing: string[] = [];
const drifted: string[] = [];
const written: string[] = [];
let unchanged = 0;

for (const entry of VAULT_DOC_MANIFEST) {
  const source = join(vaultDir, entry.vault);
  if (!existsSync(source)) {
    missing.push(entry.vault);
    continue;
  }
  const next = transformForRepo(readFileSync(source, "utf8"), entry);
  const target = join(repoRoot, entry.repo);
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (current === next) {
    unchanged += 1;
    continue;
  }
  if (checkOnly) {
    drifted.push(entry.repo);
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, next);
  written.push(entry.repo);
}

// Vault notes in Work/Coeus that are intentionally not synced (informational).
const synced = new Set(VAULT_DOC_MANIFEST.map((entry) => entry.vault));
function listMarkdown(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory()
      ? listMarkdown(join(dir, item.name), `${prefix}${item.name}/`)
      : item.name.endsWith(".md")
        ? [`${prefix}${item.name}`]
        : [],
  );
}
const vaultOnly = listMarkdown(vaultDir).filter((name) => !synced.has(name));

if (missing.length > 0) {
  console.error(`docs-pull: missing in vault:\n${missing.map((m) => `  - ${m}`).join("\n")}`);
}
if (checkOnly) {
  if (drifted.length > 0) {
    console.error(
      `docs-check: ${drifted.length} file(s) differ from the vault:\n` +
        `${drifted.map((d) => `  - ${d}`).join("\n")}\n` +
        "Run `npm run docs:pull` (vault wins), or move the edit into Obsidian first if the\n" +
        "repo copy holds changes that exist nowhere else.",
    );
  } else if (missing.length === 0) {
    console.log(`docs-check: ${unchanged} product docs match the vault.`);
  }
} else {
  console.log(`docs-pull: ${written.length} updated, ${unchanged} unchanged.`);
  for (const file of written) console.log(`  wrote ${file}`);
}
if (vaultOnly.length > 0) {
  console.log(`vault-only (not synced): ${vaultOnly.join(", ")}`);
}
process.exit(missing.length > 0 || drifted.length > 0 ? 1 : 0);
