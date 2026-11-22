# Docs: who owns what

Product documentation is authored in the **Obsidian vault**; engineering
documentation is authored **in this repo**. Each document has exactly one home. The
repo holds a generated, committed copy of the product docs so CI, agents, and fresh
clones work without the vault.

## Ownership

| Kind | Source of truth | Files |
|---|---|---|
| **Product** (intent, UX, strategy) | Obsidian vault, `Work/Coeus/` | `PRD.md`, `product-notes.md`, `product-review-2026-11.md`, `profile-page-plan.md`, `art-direction.md`, `ux/*.md` |
| **Engineering** (how it is built and run) | This repo, `docs/` and `HANDOFF.md` | everything else: `codebase-findings.md`, `lib-architecture.md`, `ui-orchestration.md`, `synced-archive-architecture.md`, `destination-delivery-decision.md`, `notifications.md`, `deployment.md`, `design-system.md`, `preview-spike-*.md`, `support/` |

Rule of thumb: if it changes in the same pull request as the code, it is engineering
and lives here. If it records what to build and why, it is product and lives in the
vault. `HANDOFF.md` still wins on what ships; the product docs win on intent.

The product files in this repo start with a `GENERATED from the Obsidian vault`
banner. **Do not edit them here.** The next `docs:pull` overwrites the change.

## Workflow

1. Edit the note in Obsidian (`Work/Coeus/`).
2. In the repo, run `npm run docs:pull`.
3. Review the diff and commit it with the code change it relates to.

`npm run docs:check` exits non-zero if any generated copy differs from the vault. Use
it before committing docs changes, or as a quick "am I in sync" test. CI cannot run
it, because CI has no vault.

### One-time setup per machine

The script needs the path of the vault's `Work/Coeus` folder. Either set
`COEUS_VAULT_DIR`, or put the path on the first line of `.docs-vault` in the repo root
(gitignored, so the path never reaches git):

```bash
echo "/path/to/your-vault/Work/Coeus" > .docs-vault
```

Git worktrees need their own `.docs-vault`; ignored files are not shared between
worktrees.

## What the pull does to a note

- Copies it to the mapped path in `docs/`. The mapping is `VAULT_DOC_MANIFEST` in
  [`src/lib/docs/vaultSync.ts`](../src/lib/docs/vaultSync.ts). Repo paths are stable on
  purpose: code comments and cross-links cite them (for example
  `docs/profile-page-plan.md`).
- Adds the generated banner (after any frontmatter).
- Removes `%% Obsidian comments %%`. Put anything private inside `%% … %%` and it stays
  in the vault.
- Rewrites `[[wikilinks]]` to synced notes as relative markdown links. Links to
  anything not synced (canvases, vault-only notes) become plain text. `![[embeds]]`
  become a `*(vault embed: name)*` placeholder, since images do not travel.
- Leaves fenced code and inline code untouched.

The vault's `Coeus.md` (the thinking-out-loud note, linked as `[[Coeus]]` across the
vault) is `docs/product-notes.md` in the repo. That is the only renamed file.

Notes in `Work/Coeus/` that are not in the manifest (`Brand.md`, `Design.md`,
`Timeline.md`, `SDD.md`, `Coeus.collection.md`, `Coeus.canvas`) are vault-only and are
not copied. `SDD.md` in the vault is an index that points back to the engineering docs
here.

## Adding or moving a product doc

1. Create the note under `Work/Coeus/` in the vault.
2. Add `{ vault, repo }` to `VAULT_DOC_MANIFEST` in `src/lib/docs/vaultSync.ts`.
3. Run `npm run docs:pull` and commit the new generated file with the manifest change.

To hand a doc to the repo instead, remove it from the manifest and delete the banner
line from the repo copy; it is then an ordinary engineering doc.

## Known limits

- Relative links from product docs to engineering docs (`../HANDOFF.md`,
  `synced-archive-architecture.md`) work on GitHub but are dead inside Obsidian.
- The sync is one-way. If someone edits a generated file in the repo anyway,
  `docs:check` reports the drift. Move the edit into the vault before pulling, or it
  is lost.
- The vault is a personal workspace. Everything in a synced note is committed to this
  repo, so keep private material in `%% … %%` blocks or in vault-only notes.

## History

- **2026-11-21**: the vault and `docs/` had drifted (the vault held a stub PRD and an
  older copy of the notes; the repo held the real spec). Consolidated into the vault:
  repo PRD plus the vault's original outline (now PRD §10); the vault note `Coeus.md`
  merged with `product-notes.md` (the vault's Sep 23 collections notes and
  Marketing/Team/Research sections kept; the repo's Seeding & community rollout
  section and related bullets added); product review, profile plan, art direction, and
  UX docs moved into the vault. The vault became the source of truth from that point.
