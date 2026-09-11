/**
 * Live smoke test for the destination sync adapters (bareaga_web-2u2.5).
 *
 * Exercises the real GitHub Git Data API and the real Notion API against
 * throwaway targets. Drives the adapters directly — no Supabase, no app auth,
 * no worker — so it can run with nothing but credentials in the environment.
 *
 * Run:
 *   GITHUB portion:
 *     SMOKE_GITHUB_TOKEN=ghp_xxx \
 *     SMOKE_GITHUB_REPO=you/coeus-sync-scratch \
 *     SMOKE_GITHUB_BRANCH=main \
 *     node --import tsx scripts/destination-smoke.mts github
 *
 *   NOTION portion (token = an internal integration secret OR an OAuth access
 *   token; the adapter treats them identically):
 *     SMOKE_NOTION_TOKEN=secret_xxx \
 *     SMOKE_NOTION_DATABASE_ID=xxxxxxxxxxxx \
 *     node --import tsx scripts/destination-smoke.mts notion
 *
 *   Both: `node --import tsx scripts/destination-smoke.mts all`
 *
 * The GitHub repo must already exist and contain at least one commit on the
 * target branch. Everything the script writes lives under `coeus-smoke/` (repo)
 * or is archived immediately (Notion), so a scratch repo / scratch database
 * stays clean enough to reuse.
 */
import { GitHubGitAdapter, type GitBatchAction } from "../src/lib/obsidianGitAdapter.server.ts";
import { NotionAdapter } from "../src/lib/notionAdapter.server.ts";
import { itemToObsidianNote } from "../src/lib/archive/archiveExport.ts";
import type { ArchiveItem } from "../src/lib/archiveTypes.ts";

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

function item(id: string, overrides: Partial<ArchiveItem> = {}): ArchiveItem {
  return {
    id,
    articleId: `article-${id}`,
    title: `Smoke item ${id}`,
    url: `https://example.com/${id}`,
    sourceName: "Smoke Source",
    topic: "testing",
    summary: `Summary for ${id}`,
    author: "Smoke Runner",
    publishedAt: null,
    savedAt: new Date().toISOString(),
    state: "unread",
    starred: false,
    collectionIds: [],
    tags: [],
    note: "",
    ...overrides,
  };
}

async function githubSmoke(): Promise<void> {
  const token = required("SMOKE_GITHUB_TOKEN");
  const repo = required("SMOKE_GITHUB_REPO");
  const branch = process.env.SMOKE_GITHUB_BRANCH ?? "main";
  const config = { repo, branch, pathPrefix: "coeus-smoke" };
  const stamp = Date.now().toString(36);
  const a = `smoke-${stamp}-a`;
  const b = `smoke-${stamp}-b`;

  console.log(`\nGitHub / Obsidian adapter → ${repo}@${branch} (coeus-smoke/)`);
  const adapter = new GitHubGitAdapter(config, token);

  const upserts: GitBatchAction[] = [a, b].map((id) => ({
    itemId: id,
    kind: "upsert",
    path: adapter.path(id),
    content: itemToObsidianNote(item(id)),
  }));
  const first = await adapter.pushBatch(upserts);
  check("initial 2-item upsert lands one commit", [...first.values()].every((r) => r.ok), Object.fromEntries(first));
  check("upsert externalRef is the repo path", first.get(a)?.ok === true && first.get(a)?.externalRef === adapter.path(a));

  const changed = await adapter.pushBatch([
    { itemId: a, kind: "upsert", path: adapter.path(a), content: itemToObsidianNote(item(a, { title: "Smoke item a (edited)" })) },
  ]);
  check("changed-item re-upsert succeeds", changed.get(a)?.ok === true, Object.fromEntries(changed));

  const removed = await adapter.pushBatch([{ itemId: b, kind: "delete", path: adapter.path(b) }]);
  check("delete succeeds", removed.get(b)?.ok === true, Object.fromEntries(removed));

  const bad = new GitHubGitAdapter(config, "ghp_definitely_not_a_real_token");
  const badResult = await bad.pushBatch([{ itemId: a, kind: "upsert", path: adapter.path(a), content: "x" }]);
  const badOne = badResult.get(a);
  check("bad token → authError, not a retryable error", badOne?.ok === false && badOne.authError === true, badOne);

  // "disconnect + reconnect the same destination creates no duplicate files":
  // a fresh adapter with no delivery state re-pushes item a to its deterministic
  // path; GitHub upsert keys on path, so the tree entry replaces rather than adds.
  const reconnected = new GitHubGitAdapter(config, token);
  const reAdd = await reconnected.pushBatch([
    { itemId: a, kind: "upsert", path: reconnected.path(a), content: itemToObsidianNote(item(a)) },
  ]);
  check("reconnect re-push targets the same path (no duplicate)", reAdd.get(a)?.externalRef === adapter.path(a), Object.fromEntries(reAdd));

  // cleanup
  await adapter.pushBatch([{ itemId: a, kind: "delete", path: adapter.path(a) }]);
  console.log("  · cleaned up coeus-smoke/ test files");
}

async function notionSmoke(): Promise<void> {
  const token = required("SMOKE_NOTION_TOKEN");
  const databaseId = required("SMOKE_NOTION_DATABASE_ID");
  const config = { databaseId, workspaceName: "Smoke" };

  console.log(`\nNotion adapter → database ${databaseId}`);
  const adapter = new NotionAdapter(config, token);

  const created = await adapter.pushUpsert(item("n1"), null);
  check("create page returns an externalRef", created.ok === true && typeof created.externalRef === "string", created);
  const pageId = created.externalRef ?? "";

  const patched = await adapter.pushUpsert(item("n1", { title: "Smoke item n1 (edited)" }), pageId);
  check("update existing page keeps the same externalRef", patched.ok === true && patched.externalRef === pageId, patched);

  // "disconnect + reconnect creates no duplicate pages": a fresh adapter with no
  // delivery state re-pushes n1 with its known externalRef. pushUpsert must PATCH,
  // not POST — so the live page count for this item stays at exactly 1.
  const reconnected = new NotionAdapter(config, token);
  const rePush = await reconnected.pushUpsert(item("n1"), pageId);
  check("reconnect re-push keeps the same externalRef (PATCH not POST)", rePush.ok === true && rePush.externalRef === pageId, rePush);
  check("exactly one live page for the item after reconnect re-push", (await livePageCount(token, pageId)) === 1);

  const bad = new NotionAdapter(config, "secret_not_a_real_token");
  const badResult = await bad.pushUpsert(item("n2"), null);
  check("bad token → authError, not a retryable error", badResult.ok === false && badResult.authError === true, badResult);

  const archived = await adapter.pushDelete("n1", pageId);
  check("delete archives the page", archived.ok === true, archived);
  check("archived page no longer counts as live", (await livePageCount(token, pageId)) === 0);
  console.log("  · archived the smoke page");
}

/** 1 if the page exists and is not archived, else 0. */
async function livePageCount(token: string, pageId: string): Promise<number> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
  });
  if (!res.ok) return 0;
  const body = (await res.json()) as { archived?: boolean; in_trash?: boolean };
  return body.archived || body.in_trash ? 0 : 1;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
  return value;
}

const mode = process.argv[2] ?? "all";
if (mode === "github" || mode === "all") await githubSmoke();
if (mode === "notion" || mode === "all") await notionSmoke();

console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures} check${failures === 1 ? "" : "s"})`}`);
process.exit(failures === 0 ? 0 : 1);
