/**
 * Obsidian vault → repo sync for product documentation.
 *
 * The product docs (PRD, product notes, UX specs, …) are authored in the
 * Obsidian vault at `Work/Coeus/`. The repo keeps a committed, generated copy
 * under `docs/` so CI, agents, and fresh clones work without the vault. This
 * module is the pure half of that sync (no filesystem access): the manifest of
 * what is synced and the transform from vault markdown to repo markdown.
 * `scripts/docs-pull.mts` does the I/O. See docs/README.md.
 */

export type VaultDocEntry = {
  /** Path relative to the vault's `Work/Coeus/` folder. */
  vault: string;
  /** Path relative to the repo root. */
  repo: string;
};

/**
 * Everything listed here is owned by the vault. Anything else in `docs/`
 * (codebase-findings, deployment, lib-architecture, …) is engineering
 * documentation owned by the repo. Repo paths are unchanged from before the
 * move so code comments and cross-links that cite them keep working.
 *
 * The vault's `Coeus.md` is the thinking-out-loud note that was forked into
 * `docs/product-notes.md`; the vault keeps its name because `[[Coeus]]` is
 * linked from across the vault.
 */
export const VAULT_DOC_MANIFEST: readonly VaultDocEntry[] = [
  { vault: "PRD.md", repo: "docs/PRD.md" },
  { vault: "Coeus.md", repo: "docs/product-notes.md" },
  { vault: "product-review-2026-11.md", repo: "docs/product-review-2026-11.md" },
  { vault: "profile-page-plan.md", repo: "docs/profile-page-plan.md" },
  { vault: "art-direction.md", repo: "docs/art-direction.md" },
  { vault: "ux/README.md", repo: "docs/ux/README.md" },
  { vault: "ux/information-architecture.md", repo: "docs/ux/information-architecture.md" },
  { vault: "ux/screen-specifications.md", repo: "docs/ux/screen-specifications.md" },
  {
    vault: "ux/user-flow-research-and-test-plan.md",
    repo: "docs/ux/user-flow-research-and-test-plan.md",
  },
  { vault: "ux/requirements-traceability.md", repo: "docs/ux/requirements-traceability.md" },
];

export const GENERATED_MARKER = "GENERATED from the Obsidian vault";

export function generatedBanner(entry: VaultDocEntry): string {
  return (
    `<!-- ${GENERATED_MARKER} (Work/Coeus/${entry.vault}). ` +
    "Do not edit here: edit it in Obsidian, then run `npm run docs:pull`. " +
    "See docs/README.md. -->"
  );
}

function posixDirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function relativePosix(fromDir: string, to: string): string {
  const from = fromDir ? fromDir.split("/") : [];
  const target = to.split("/");
  let shared = 0;
  while (
    shared < from.length &&
    shared < target.length - 1 &&
    from[shared] === target[shared]
  ) {
    shared += 1;
  }
  const up = from.slice(shared).map(() => "..");
  return [...up, ...target.slice(shared)].join("/");
}

function noteKey(name: string): string {
  const base = name.split("/").pop() ?? name;
  return base.replace(/\.md$/i, "").trim().toLowerCase();
}

function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const match = /^---\n[\s\S]*?\n---\n/.exec(text);
  if (!match) return { frontmatter: "", body: text };
  return { frontmatter: match[0], body: text.slice(match[0].length) };
}

/** Apply `fn` to prose only: fenced code blocks and inline code are left alone. */
function mapOutsideCode(text: string, fn: (prose: string) => string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : fn(part)))
    .join("");
}

function convertObsidianSyntax(prose: string, entry: VaultDocEntry, manifest: readonly VaultDocEntry[]): string {
  const byNote = new Map(manifest.map((item) => [noteKey(item.vault), item]));
  const fromDir = posixDirname(entry.repo);

  // Embeds (`![[image.png|425]]`, `![[Note]]`) cannot render outside the vault.
  const withoutEmbeds = prose.replace(/!\[\[([^\]]+)\]\]/g, (_all, inner: string) => {
    const target = inner.split("|")[0]?.trim() ?? inner;
    return `*(vault embed: ${target})*`;
  });

  return withoutEmbeds.replace(/\[\[([^\]]+)\]\]/g, (_all, inner: string) => {
    const [targetAndHeading = "", alias] = inner.split("|");
    const target = targetAndHeading.split("#")[0]?.trim() ?? "";
    const label = (alias ?? targetAndHeading).trim();
    const hit = target ? byNote.get(noteKey(target)) : undefined;
    // Link only to synced notes; everything else (canvases, vault-only notes)
    // becomes plain text rather than a dead link.
    if (!hit || hit.repo === entry.repo) return label;
    return `[${label}](${relativePosix(fromDir, hit.repo)})`;
  });
}

/**
 * Turn a vault note into the committed repo copy: strip Obsidian-only syntax
 * (`%% comments %%`, wikilinks, embeds) and stamp the generated banner.
 */
export function transformForRepo(
  source: string,
  entry: VaultDocEntry,
  manifest: readonly VaultDocEntry[] = VAULT_DOC_MANIFEST,
): string {
  const normalized = source.replace(/\r\n/g, "\n");
  // `%% … %%` is Obsidian's private-comment syntax: it never leaves the vault.
  const withoutComments = normalized.replace(/%%[\s\S]*?%%/g, "");
  const { frontmatter, body } = splitFrontmatter(withoutComments);
  const converted = mapOutsideCode(body, (prose) => convertObsidianSyntax(prose, entry, manifest));
  const cleaned = converted.replace(/^\n+/, "").replace(/\s+$/, "");
  return `${frontmatter}${generatedBanner(entry)}\n\n${cleaned}\n`;
}
