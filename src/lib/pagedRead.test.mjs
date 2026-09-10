import assert from "node:assert/strict";
import test from "node:test";

import { POSTGREST_PAGE_SIZE, readAllPages } from "./pagedRead.ts";

test("readAllPages requests every PostgREST page, including row 1,001", async () => {
  const calls = [];
  const rows = await readAllPages(async (from, to) => {
    calls.push([from, to]);
    return { data: from === 0 ? Array.from({ length: POSTGREST_PAGE_SIZE }, (_, index) => index) : [POSTGREST_PAGE_SIZE], error: null };
  });

  assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
  assert.equal(rows.length, 1001);
  assert.equal(rows[1000], 1000);
});

test("readAllPages surfaces a page error without continuing", async () => {
  const failure = new Error("database unavailable");
  await assert.rejects(() => readAllPages(async () => ({ data: null, error: failure })), failure);
});
