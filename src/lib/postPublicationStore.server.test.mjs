import assert from "node:assert/strict";
import test from "node:test";

import { SupabasePostPublicationStore } from "./postPublicationStore.server.ts";
import { decodeProfileFeedCursor } from "./profileFeedCursor.ts";

/**
 * bt0 query-budget contract for the profile Posts tab. `listByAuthor` must
 * issue one query and load at most POST_LIMIT (500) rows no matter how
 * prolific the author is. Driven through a fake PostgREST builder that records
 * every query and honours `.limit()`.
 */

function fakeSupabase(rowsByTable) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, filters: [], order: null, orders: [], limit: null, or: null };
      const builder = {
        select: () => builder,
        eq: (column, value) => (q.filters.push(["eq", column, value]), builder),
        order: (column, options) => {
          const entry = { column, ...options };
          q.orders.push(entry);
          if (!q.order) q.order = entry;
          return builder;
        },
        or: (expr) => ((q.or = expr), builder),
        limit: (n) => ((q.limit = n), builder),
        then: (resolve, reject) => {
          calls.push(q);
          let rows = (rowsByTable[table] ?? []).filter((row) =>
            q.filters.every(([, column, value]) => row[column] === value),
          );
          if (q.or) rows = rows.filter((row) => matchesKeysetOr(q.or, row));
          // Emulate `.order(col desc)` chains so the fake honours row order.
          for (const entry of [...q.orders].reverse()) {
            rows = [...rows].sort((a, b) => {
              const cmp = a[entry.column] < b[entry.column] ? -1 : a[entry.column] > b[entry.column] ? 1 : 0;
              return entry.ascending === false ? -cmp : cmp;
            });
          }
          if (q.limit != null) rows = rows.slice(0, q.limit);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

/** Parse the one keyset shape the stores emit:
 * `<ts col>.lt.<ts>,and(<ts col>.eq.<ts>,<id col>.lt.<id>)`. */
function matchesKeysetOr(expr, row) {
  const m = expr.match(/^(\w+)\.lt\.(.+?),and\(\1\.eq\.\2,(\w+)\.lt\.(.+)\)$/);
  if (!m) throw new Error(`fake cannot parse .or(${expr})`);
  const [, tsCol, ts, idCol, id] = m;
  return row[tsCol] < ts || (row[tsCol] === ts && row[idCol] < id);
}

function postRows(count, authorId = "author") {
  return Array.from({ length: count }, (_, i) => ({
    author_id: authorId,
    item_local_id: `item-${i}`,
    title: `Post ${i}`,
    url: `https://example.com/${i}`,
    source_name: "Example",
    author: "Example Author",
    excerpt: "",
    commentary: "",
    visibility: "public",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));
}

test("listByAuthor bounds the row load at POST_LIMIT", async () => {
  const supabase = fakeSupabase({ posts: postRows(650) });
  const store = new SupabasePostPublicationStore(supabase);

  const posts = await store.listByAuthor("author");

  assert.equal(posts.length, 500);
  const query = supabase.calls.find((c) => c.table === "posts");
  assert.equal(query.limit, 500);
  assert.deepEqual(query.order, { column: "created_at", ascending: false });
});

test("listByAuthor query count does not scale with the author's post count", async () => {
  const small = fakeSupabase({ posts: postRows(3) });
  const large = fakeSupabase({ posts: postRows(650) });

  await new SupabasePostPublicationStore(small).listByAuthor("author");
  await new SupabasePostPublicationStore(large).listByAuthor("author");

  assert.equal(small.calls.length, 1);
  assert.equal(large.calls.length, small.calls.length);
});

function pagePostRows(count, authorId = "author") {
  // Newest is index 0. Adjacent rows are paired onto the same created_at so the
  // id tiebreaker decides order within a pair — and a page boundary can land
  // mid-pair.
  return Array.from({ length: count }, (_, i) => {
    const minutesAgo = i - (i % 2);
    return {
      id: `post-${String(count - i).padStart(4, "0")}`,
      author_id: authorId,
      item_local_id: `item-${i}`,
      title: `Post ${i}`,
      url: `https://example.com/${i}`,
      source_name: "Example",
      author: "",
      excerpt: "",
      commentary: "",
      visibility: "public",
      created_at: new Date(Date.UTC(2026, 0, 1) - minutesAgo * 60000).toISOString(),
      updated_at: "2026-01-01T00:00:00Z",
    };
  });
}

test("pageByAuthor returns one page, orders by (created_at desc, id desc), and reports hasMore", async () => {
  const supabase = fakeSupabase({ posts: pagePostRows(30) });
  const store = new SupabasePostPublicationStore(supabase);

  const first = await store.pageByAuthor("author", { cursor: null, limit: 10 });

  assert.equal(first.items.length, 10);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);
  assert.equal(supabase.calls.length, 1);
  assert.deepEqual(
    supabase.calls[0].orders,
    [
      { column: "created_at", ascending: false },
      { column: "id", ascending: false },
    ],
  );
  assert.equal(supabase.calls[0].limit, 11, "fetches one extra row to detect hasMore");
});

test("pageByAuthor walks the whole catalogue with no gap or repeat across page boundaries", async () => {
  const rows = pagePostRows(25);
  const seen = [];
  let cursor = null;
  for (let guard = 0; guard < 10; guard++) {
    const store = new SupabasePostPublicationStore(fakeSupabase({ posts: rows }));
    const page = await store.pageByAuthor("author", { cursor, limit: 10 });
    seen.push(...page.items.map((p) => p.itemLocalId));
    if (!page.hasMore) break;
    cursor = decodeProfileFeedCursor(page.nextCursor);
  }

  assert.equal(seen.length, 25);
  assert.equal(new Set(seen).size, 25, "no row appears on two pages");
});

test("pageByAuthor clamps an oversized limit", async () => {
  const supabase = fakeSupabase({ posts: pagePostRows(400) });
  await new SupabasePostPublicationStore(supabase).pageByAuthor("author", { cursor: null, limit: 5000 });
  assert.equal(supabase.calls[0].limit, 101, "100 max + 1 probe row");
});

test("pageByAuthor query count is constant regardless of catalogue size", async () => {
  const small = fakeSupabase({ posts: pagePostRows(3) });
  const large = fakeSupabase({ posts: pagePostRows(400) });
  await new SupabasePostPublicationStore(small).pageByAuthor("author", { cursor: null, limit: 24 });
  await new SupabasePostPublicationStore(large).pageByAuthor("author", { cursor: null, limit: 24 });
  assert.equal(small.calls.length, 1);
  assert.equal(large.calls.length, 1);
});

test("listByAuthor only returns the requested author's rows", async () => {
  const supabase = fakeSupabase({
    posts: [...postRows(2, "author"), ...postRows(3, "someone-else")],
  });
  const store = new SupabasePostPublicationStore(supabase);

  const posts = await store.listByAuthor("author");

  assert.equal(posts.length, 2);
});
