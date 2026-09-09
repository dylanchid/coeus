import assert from "node:assert/strict";
import test from "node:test";

import { SupabasePostPublicationStore } from "./postPublicationStore.server.ts";

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
      const q = { table, filters: [], order: null, limit: null };
      const builder = {
        select: () => builder,
        eq: (column, value) => (q.filters.push(["eq", column, value]), builder),
        order: (column, options) => ((q.order = { column, ...options }), builder),
        limit: (n) => ((q.limit = n), builder),
        then: (resolve, reject) => {
          calls.push(q);
          let rows = (rowsByTable[table] ?? []).filter((row) =>
            q.filters.every(([, column, value]) => row[column] === value),
          );
          if (q.limit != null) rows = rows.slice(0, q.limit);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
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

test("listByAuthor only returns the requested author's rows", async () => {
  const supabase = fakeSupabase({
    posts: [...postRows(2, "author"), ...postRows(3, "someone-else")],
  });
  const store = new SupabasePostPublicationStore(supabase);

  const posts = await store.listByAuthor("author");

  assert.equal(posts.length, 2);
});
