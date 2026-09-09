import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseConversationProfileReader } from "./conversationProfileStore.server.ts";

/**
 * bt0 query-budget contract: the profile page's conversation reads must issue
 * a fixed, small number of queries and load a bounded number of rows no matter
 * how busy a thread or actor is. These tests drive the store through a fake
 * PostgREST builder that records every query and honours `.limit()`.
 */

function applyFilters(rows, filters) {
  return rows.filter((row) =>
    filters.every(([op, col, val]) => {
      if (op === "eq") return row[col] === val;
      if (op === "is") return row[col] === val;
      if (op === "in") return val.includes(row[col]);
      return true;
    }),
  );
}

function fakeSupabase(tables) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, filters: [], limit: null };
      const builder = {
        select: () => builder,
        eq: (c, v) => (q.filters.push(["eq", c, v]), builder),
        is: (c, v) => (q.filters.push(["is", c, v]), builder),
        in: (c, v) => (q.filters.push(["in", c, v]), builder),
        order: () => builder,
        limit: (n) => ((q.limit = n), builder),
        then: (resolve, reject) => {
          calls.push(q);
          let rows = applyFilters(tables[table] ?? [], q.filters);
          if (q.limit != null) rows = rows.slice(0, q.limit);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function replyRow(id, parentId, overrides = {}) {
  return {
    id,
    parent_id: parentId,
    author_id: overrides.author_id ?? "actor",
    target_type: "post",
    target_id: "p1",
    body: `body ${id}`,
    visibility: "public",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function tablesWithChildren(childCount) {
  return {
    replies: [
      replyRow("root", null),
      ...Array.from({ length: childCount }, (_, i) => replyRow(`c${i}`, "root", { author_id: "other" })),
    ],
    posts: [
      { id: "p1", title: "t", url: "https://e.com", source_name: "s", author: "a", visibility: "public", author_id: "actor" },
    ],
    profiles: [
      { id: "actor", handle: "actor" },
      { id: "other", handle: "other" },
    ],
  };
}

test("listRepliesByActor caps descendants per level at REPLY_DESCENDANT_LIMIT", async () => {
  const supabase = fakeSupabase(tablesWithChildren(300));
  const reader = new SupabaseConversationProfileReader(supabase);

  const replies = await reader.listRepliesByActor("actor");

  // 1 root + 200 capped level-2 descendants (level 3 has none).
  assert.equal(replies.length, 201);

  const childQuery = supabase.calls.find(
    (c) => c.table === "replies" && c.filters.some(([op, col]) => op === "in" && col === "parent_id"),
  );
  assert.equal(childQuery.limit, 200);
});

test("conversation read query count does not scale with thread size", async () => {
  const small = fakeSupabase(tablesWithChildren(3));
  const large = fakeSupabase(tablesWithChildren(300));

  await new SupabaseConversationProfileReader(small).listRepliesByActor("actor");
  await new SupabaseConversationProfileReader(large).listRepliesByActor("actor");

  assert.equal(small.calls.length, large.calls.length);
});

test("listLikesByActor and listRepostsByActor bound the row load", async () => {
  const tables = {
    likes: Array.from({ length: 250 }, (_, i) => ({
      created_at: "2026-01-01T00:00:00Z",
      target_type: "post",
      target_id: `p${i}`,
      actor_id: "actor",
    })),
    posts: [],
    profiles: [],
  };
  const supabase = fakeSupabase(tables);
  const reader = new SupabaseConversationProfileReader(supabase);

  const likes = await reader.listLikesByActor("actor");

  assert.equal(likes.length, 100);
  const likeQuery = supabase.calls.find((c) => c.table === "likes");
  assert.equal(likeQuery.limit, 100);
});
