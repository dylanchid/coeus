import assert from "node:assert/strict";
import test from "node:test";

import { NotionAdapter } from "./notionAdapter.server.ts";
import { createDemoArchive } from "./archiveFixtures.ts";

const CONFIG = { databaseId: "db-1", workspaceName: "Acme" };
const ITEM = createDemoArchive().items[0];

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

test("pushUpsert POSTs a new page when there is no existing externalRef", async () => {
  const { fetcher, calls } = fetcherFromScript([jsonResponse({ id: "page-1" })]);
  const adapter = new NotionAdapter(CONFIG, "token", fetcher);
  const result = await adapter.pushUpsert(ITEM, null);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /\/v1\/pages$/);
  assert.deepEqual(calls[0].body.parent, { database_id: "db-1" });
  assert.deepEqual(result, { ok: true, externalRef: "page-1", httpStatus: 200 });
});

test("pushUpsert PATCHes the existing page when an externalRef is already known", async () => {
  const { fetcher, calls } = fetcherFromScript([jsonResponse({ id: "page-1" })]);
  const adapter = new NotionAdapter(CONFIG, "token", fetcher);
  const result = await adapter.pushUpsert(ITEM, "page-1");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "PATCH");
  assert.match(calls[0].url, /\/v1\/pages\/page-1$/);
  assert.deepEqual(result, { ok: true, externalRef: "page-1", httpStatus: 200 });
});

test("pushDelete archives the page rather than deleting it", async () => {
  const { fetcher, calls } = fetcherFromScript([jsonResponse({ id: "page-1", archived: true })]);
  const adapter = new NotionAdapter(CONFIG, "token", fetcher);
  const result = await adapter.pushDelete(ITEM.id, "page-1");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "PATCH");
  assert.deepEqual(calls[0].body, { archived: true });
  assert.deepEqual(result, { ok: true, httpStatus: 200 });
});

test("a 401 is mapped to an authError, distinct from a 429 rate limit", async () => {
  const unauthorized = fetcherFromScript([jsonResponse({ message: "API token is invalid." }, 401)]);
  const unauthorizedAdapter = new NotionAdapter(CONFIG, "bad-token", unauthorized.fetcher);
  const authFailure = await unauthorizedAdapter.pushUpsert(ITEM, null);
  assert.deepEqual(authFailure, { ok: false, httpStatus: 401, authError: true, error: "Notion authentication failed" });

  const rateLimited = fetcherFromScript([jsonResponse({ message: "rate limited" }, 429)]);
  const rateLimitedAdapter = new NotionAdapter(CONFIG, "token", rateLimited.fetcher);
  const rateLimitFailure = await rateLimitedAdapter.pushUpsert(ITEM, null);
  assert.deepEqual(rateLimitFailure, { ok: false, httpStatus: 429, error: "Notion rate limit exceeded" });
  assert.equal(rateLimitFailure.authError, undefined);
});

test("a 5xx surfaces Notion's error message without an auth flag", async () => {
  const { fetcher } = fetcherFromScript([jsonResponse({ message: "Internal server error" }, 500)]);
  const adapter = new NotionAdapter(CONFIG, "token", fetcher);
  const result = await adapter.pushUpsert(ITEM, null);
  assert.deepEqual(result, { ok: false, httpStatus: 500, error: "Internal server error" });
});
