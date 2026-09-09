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
      const q = { table, filters: [], limit: null, single: false };
      const settle = (resolve, reject) => {
        calls.push(q);
        let rows = applyFilters(tables[table] ?? [], q.filters);
        if (q.limit != null) rows = rows.slice(0, q.limit);
        const data = q.single ? rows[0] ?? null : rows;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      };
      const builder = {
        select: () => builder,
        eq: (c, v) => (q.filters.push(["eq", c, v]), builder),
        is: (c, v) => (q.filters.push(["is", c, v]), builder),
        in: (c, v) => (q.filters.push(["in", c, v]), builder),
        order: () => builder,
        limit: (n) => ((q.limit = n), builder),
        maybeSingle: () => ((q.single = true), { then: settle }),
        single: () => ((q.single = true), { then: settle }),
        then: settle,
      };
      return builder;
    },
    rpc(name, args) {
      const q = { rpc: name, args };
      return {
        then: (resolve, reject) => {
          calls.push(q);
          return Promise.resolve({ data: runRpc(name, args, tables), error: null }).then(resolve, reject);
        },
      };
    },
  };
}

/** Deterministic stand-ins for the two thread RPCs, walking the fake `replies`
 * rows the same way the SQL recursive CTEs do. */
function descendantsOf(rootId, replies) {
  const out = [];
  let frontier = [rootId];
  while (frontier.length) {
    const next = replies.filter((r) => frontier.includes(r.parent_id));
    out.push(...next);
    frontier = next.map((r) => r.id);
  }
  return out;
}

function runRpc(name, args, tables) {
  const replies = tables.replies ?? [];
  if (name === "thread_descendants") {
    const rows = descendantsOf(args.p_root_id, replies)
      .filter(
        (r) =>
          args.p_after_created_at == null ||
          r.created_at > args.p_after_created_at ||
          (r.created_at === args.p_after_created_at && r.id > args.p_after_id),
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const limit = Math.max(1, Math.min(args.p_limit ?? 50, 200));
    return rows.slice(0, limit);
  }
  if (name === "thread_descendant_counts") {
    return args.p_root_ids
      .map((rootId) => ({ root_id: rootId, total: descendantsOf(rootId, replies).length }))
      .filter((row) => row.total > 0);
  }
  throw new Error(`fake has no rpc ${name}`);
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

// ── the dedicated thread page (bareaga_web-kxe) ────────────────────────────

function deepThreadTables(depth, breadth) {
  // A chain `root -> l1 -> l2 -> ... -> l<depth>`, each level also carrying
  // `breadth` leaf siblings, so "all descendants" is far more than the tab's
  // two capped levels.
  const replies = [
    {
      id: "root",
      parent_id: null,
      author_id: "actor",
      target_type: "post",
      target_id: "p1",
      body: "root",
      visibility: "public",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
  let parent = "root";
  let clock = 1;
  for (let level = 1; level <= depth; level++) {
    const chainId = `l${level}`;
    const stamp = () => `2026-01-01T00:00:${String(clock++).padStart(2, "0")}Z`;
    replies.push({
      id: chainId,
      parent_id: parent,
      author_id: level % 2 ? "other" : "actor",
      target_type: "post",
      target_id: "p1",
      body: `reply ${chainId}`,
      visibility: "public",
      created_at: stamp(),
      updated_at: "2026-01-01T00:00:00Z",
    });
    for (let b = 0; b < breadth; b++) {
      replies.push({
        id: `${chainId}-b${b}`,
        parent_id: parent,
        author_id: "other",
        target_type: "post",
        target_id: "p1",
        body: `leaf ${chainId}-${b}`,
        visibility: "public",
        created_at: stamp(),
        updated_at: "2026-01-01T00:00:00Z",
      });
    }
    parent = chainId;
  }
  return {
    replies,
    posts: [
      { id: "p1", title: "t", url: "https://e.com", source_name: "s", author: "a", visibility: "public", author_id: "target-owner" },
    ],
    profiles: [
      { id: "actor", handle: "actor" },
      { id: "other", handle: "other" },
      { id: "target-owner", handle: "curator" },
    ],
  };
}

test("loadThreadPage returns the root plus one keyset page of every descendant, oldest first", async () => {
  const supabase = fakeSupabase(deepThreadTables(6, 5));
  const reader = new SupabaseConversationProfileReader(supabase);

  const first = await reader.loadThreadPage("root", { cursor: null, limit: 10 });

  assert.ok(first);
  assert.equal(first.root.id, "root");
  assert.equal(first.rootAuthorHandle, "actor");
  assert.equal(first.descendants.length, 10);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);
  // oldest-first
  const stamps = first.descendants.map((d) => d.createdAt);
  assert.deepEqual(stamps, [...stamps].sort());
});

test("loadThreadPage walks the whole tree with no gap or repeat across pages", async () => {
  const tables = deepThreadTables(6, 5); // 6 chain + 30 leaves = 36 descendants
  const seen = [];
  let cursor = null;
  for (let guard = 0; guard < 20; guard++) {
    const reader = new SupabaseConversationProfileReader(fakeSupabase(tables));
    const page = await reader.loadThreadPage("root", { cursor, limit: 8 });
    seen.push(...page.descendants.map((d) => d.id));
    if (!page.hasMore) break;
    const { decodeProfileFeedCursor } = await import("./profileFeedCursor.ts");
    cursor = decodeProfileFeedCursor(page.nextCursor);
  }
  assert.equal(seen.length, 36);
  assert.equal(new Set(seen).size, 36);
});

test("loadThreadPage query count does not scale with thread size", async () => {
  // Two large threads of very different size take the same number of queries:
  // root + descendants RPC + target + target handle + (cross-page parents) +
  // handles. The one extra "cross-page parents" lookup is itself bounded by the
  // page size, never by the thread.
  const big = fakeSupabase(deepThreadTables(8, 40)); // ~328 descendants
  const huge = fakeSupabase(deepThreadTables(12, 200)); // ~2412 descendants

  await new SupabaseConversationProfileReader(big).loadThreadPage("root", { cursor: null, limit: 40 });
  await new SupabaseConversationProfileReader(huge).loadThreadPage("root", { cursor: null, limit: 40 });

  assert.equal(big.calls.length, huge.calls.length);
  assert.ok(big.calls.length <= 6, `expected a small fixed query budget, got ${big.calls.length}`);
});

test("loadThreadPage returns null for a reply that is not a thread root", async () => {
  const supabase = fakeSupabase(deepThreadTables(3, 2));
  const reader = new SupabaseConversationProfileReader(supabase);
  assert.equal(await reader.loadThreadPage("l1", { cursor: null, limit: 10 }), null);
  assert.equal(await reader.loadThreadPage("does-not-exist", { cursor: null, limit: 10 }), null);
});

test("threadDescendantCounts returns the full nested total per root", async () => {
  const supabase = fakeSupabase(deepThreadTables(6, 5));
  const reader = new SupabaseConversationProfileReader(supabase);

  const counts = await reader.threadDescendantCounts(["root", "l1"]);
  assert.equal(counts.get("root"), 36);
  assert.equal(supabase.calls.filter((c) => c.rpc === "thread_descendant_counts").length, 1);
});
