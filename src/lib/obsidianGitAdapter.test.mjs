import assert from "node:assert/strict";
import test from "node:test";

import { GitHubGitAdapter } from "./obsidianGitAdapter.server.ts";

const CONFIG = { repo: "acme/vault", branch: "main", pathPrefix: "coeus" };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function fetcherFromScript(script) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined });
    const next = script[calls.length - 1];
    if (!next) throw new Error(`Unexpected call ${calls.length}: ${String(url)}`);
    return next;
  };
  return { fetcher, calls };
}

test("pushBatch is a no-op with zero fetch calls when there is nothing to push", async () => {
  const { fetcher, calls } = fetcherFromScript([]);
  const adapter = new GitHubGitAdapter(CONFIG, "token", fetcher);
  const outcomes = await adapter.pushBatch([]);
  assert.equal(outcomes.size, 0);
  assert.equal(calls.length, 0);
});

test("pushBatch upserts and deletes in one tree + commit round trip", async () => {
  const { fetcher, calls } = fetcherFromScript([
    jsonResponse({ object: { sha: "parent-commit-sha" } }),
    jsonResponse({ tree: { sha: "base-tree-sha" } }),
    jsonResponse({ sha: "new-tree-sha" }),
    jsonResponse({ sha: "new-commit-sha" }),
    new Response(null, { status: 200 }),
  ]);
  const adapter = new GitHubGitAdapter(CONFIG, "token", fetcher);

  const outcomes = await adapter.pushBatch([
    { itemId: "item-1", kind: "upsert", path: adapter.path("item-1"), content: "# Item 1" },
    { itemId: "item-2", kind: "delete", path: adapter.path("item-2") },
  ]);

  assert.equal(calls.length, 5);
  assert.match(calls[0].url, /\/git\/ref\/heads\/main$/);
  assert.match(calls[1].url, /\/git\/commits\/parent-commit-sha$/);
  assert.match(calls[2].url, /\/git\/trees$/);
  assert.deepEqual(calls[2].body, {
    base_tree: "base-tree-sha",
    tree: [
      { path: "coeus/item-1.md", mode: "100644", type: "blob", content: "# Item 1" },
      { path: "coeus/item-2.md", mode: "100644", type: "blob", sha: null },
    ],
  });
  assert.match(calls[3].url, /\/git\/commits$/);
  assert.deepEqual(calls[3].body.tree, "new-tree-sha");
  assert.deepEqual(calls[3].body.parents, ["parent-commit-sha"]);
  assert.match(calls[4].url, /\/git\/refs\/heads\/main$/);
  assert.equal(calls[4].method, "PATCH");
  assert.deepEqual(calls[4].body, { sha: "new-commit-sha" });

  assert.deepEqual(outcomes.get("item-1"), { ok: true, externalRef: "coeus/item-1.md", httpStatus: 200 });
  assert.deepEqual(outcomes.get("item-2"), { ok: true, httpStatus: 200 });
});

test("a 401 on any call fails the whole batch as an auth error, with no later calls", async () => {
  const { fetcher, calls } = fetcherFromScript([jsonResponse({ message: "Bad credentials" }, 401)]);
  const adapter = new GitHubGitAdapter(CONFIG, "token", fetcher);
  const outcomes = await adapter.pushBatch([
    { itemId: "item-1", kind: "upsert", path: "coeus/item-1.md", content: "hi" },
    { itemId: "item-2", kind: "upsert", path: "coeus/item-2.md", content: "hi" },
  ]);
  assert.equal(calls.length, 1);
  assert.deepEqual(outcomes.get("item-1"), { ok: false, httpStatus: 401, authError: true, error: "GitHub authentication failed" });
  assert.deepEqual(outcomes.get("item-2"), { ok: false, httpStatus: 401, authError: true, error: "GitHub authentication failed" });
});

test("a 429 fails the whole batch as retryable, not an auth error", async () => {
  // retries:0 isolates the status mapping; retry/backoff is covered in httpRetry.test.mjs.
  const { fetcher } = fetcherFromScript([jsonResponse({ object: { sha: "sha" } }), jsonResponse({ message: "rate limited" }, 429)]);
  const adapter = new GitHubGitAdapter(CONFIG, "token", fetcher, { retries: 0 });
  const outcomes = await adapter.pushBatch([{ itemId: "item-1", kind: "upsert", path: "coeus/item-1.md", content: "hi" }]);
  assert.deepEqual(outcomes.get("item-1"), { ok: false, httpStatus: 429, error: "GitHub rate limit exceeded" });
  assert.equal(outcomes.get("item-1").authError, undefined);
});

test("a transient 429 is retried and the batch then succeeds", async () => {
  const { fetcher, calls } = fetcherFromScript([
    jsonResponse({ message: "rate limited" }, 429),
    jsonResponse({ object: { sha: "parent-commit-sha" } }),
    jsonResponse({ tree: { sha: "base-tree-sha" } }),
    jsonResponse({ sha: "new-tree-sha" }),
    jsonResponse({ sha: "new-commit-sha" }),
    jsonResponse({ ref: "refs/heads/main" }),
  ]);
  const adapter = new GitHubGitAdapter(CONFIG, "token", fetcher, { retries: 2, sleep: async () => {} });
  const outcomes = await adapter.pushBatch([{ itemId: "item-1", kind: "upsert", path: "coeus/item-1.md", content: "hi" }]);
  assert.equal(calls.length, 6, "the 429 on the ref lookup is retried once, then the batch completes");
  assert.equal(outcomes.get("item-1").ok, true);
});

test("a mid-batch 5xx surfaces the GitHub error message without an auth flag", async () => {
  const { fetcher } = fetcherFromScript([
    jsonResponse({ object: { sha: "parent-commit-sha" } }),
    jsonResponse({ tree: { sha: "base-tree-sha" } }),
    jsonResponse({ message: "Internal Server Error" }, 500),
  ]);
  const adapter = new GitHubGitAdapter(CONFIG, "token", fetcher);
  const outcomes = await adapter.pushBatch([{ itemId: "item-1", kind: "upsert", path: "coeus/item-1.md", content: "hi" }]);
  assert.deepEqual(outcomes.get("item-1"), { ok: false, httpStatus: 500, error: "Internal Server Error" });
});
