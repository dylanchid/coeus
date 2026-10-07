import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseProfileStore } from "./profileStore.server.ts";
import { decodeProfileFeedCursor } from "./profileFeedCursor.ts";

/**
 * bt0 query-budget contract for the profile Collections tab.
 * `listOwnedPublications` must issue one query and load at most
 * PUBLICATION_LIMIT (500) rows no matter how large a curator's back catalogue
 * is. Driven through a fake PostgREST builder that records every query and
 * honours `.limit()`.
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

function publicationRows(count, ownerId = "owner") {
  return Array.from({ length: count }, (_, i) => ({
    owner_id: ownerId,
    id: `pub-${i}`,
    slug: `slug-${i}`,
    name: `Collection ${i}`,
    description: "",
    curator_note: "",
    visibility: "public",
    published_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    unpublished_at: null,
    collection_publication_items: [{ count: 3 }],
    collection_follows: [{ count: 1 }],
  }));
}

test("listOwnedPublications bounds the row load at PUBLICATION_LIMIT", async () => {
  const supabase = fakeSupabase({ collection_publications: publicationRows(650) });
  const store = new SupabaseProfileStore(supabase);

  const publications = await store.listOwnedPublications("owner");

  assert.equal(publications.length, 500);
  const query = supabase.calls.find((c) => c.table === "collection_publications");
  assert.equal(query.limit, 500);
  assert.deepEqual(query.order, { column: "published_at", ascending: false });
});

test("listOwnedPublications query count does not scale with the catalogue size", async () => {
  const small = fakeSupabase({ collection_publications: publicationRows(4) });
  const large = fakeSupabase({ collection_publications: publicationRows(650) });

  await new SupabaseProfileStore(small).listOwnedPublications("owner");
  await new SupabaseProfileStore(large).listOwnedPublications("owner");

  assert.equal(small.calls.length, 1);
  assert.equal(large.calls.length, small.calls.length);
});

test("listOwnedPublications carries the embedded item and follower counts through", async () => {
  const supabase = fakeSupabase({ collection_publications: publicationRows(1) });
  const [publication] = await new SupabaseProfileStore(supabase).listOwnedPublications("owner");

  assert.equal(publication.itemCount, 3);
  assert.equal(publication.followerCount, 1);
});

function pagePublicationRows(count, ownerId = "owner") {
  // Newest is index 0; adjacent rows share a published_at so the id tiebreaker
  // is load-bearing.
  return Array.from({ length: count }, (_, i) => {
    const minutesAgo = i - (i % 2);
    return {
      owner_id: ownerId,
      id: `pub-${String(count - i).padStart(4, "0")}`,
      slug: `slug-${i}`,
      name: `Collection ${i}`,
      description: "",
      curator_note: "",
      visibility: "public",
      published_at: new Date(Date.UTC(2026, 0, 1) - minutesAgo * 60000).toISOString(),
      updated_at: "2026-01-01T00:00:00Z",
      unpublished_at: null,
      collection_publication_items: [{ count: 3 }],
      collection_follows: [{ count: 1 }],
    };
  });
}

test("pageOwnedPublications returns one ordered page and a probe-derived hasMore", async () => {
  const supabase = fakeSupabase({ collection_publications: pagePublicationRows(30) });
  const page = await new SupabaseProfileStore(supabase).pageOwnedPublications("owner", {
    cursor: null,
    limit: 12,
  });

  assert.equal(page.items.length, 12);
  assert.equal(page.hasMore, true);
  assert.ok(page.nextCursor);
  assert.equal(supabase.calls.length, 1);
  assert.deepEqual(supabase.calls[0].orders, [
    { column: "published_at", ascending: false },
    { column: "id", ascending: false },
  ]);
  assert.equal(supabase.calls[0].limit, 13);
});

test("pageOwnedPublications walks the whole catalogue with no gap or repeat", async () => {
  const rows = pagePublicationRows(23);
  const seen = [];
  let cursor = null;
  for (let guard = 0; guard < 10; guard++) {
    const store = new SupabaseProfileStore(fakeSupabase({ collection_publications: rows }));
    const page = await store.pageOwnedPublications("owner", { cursor, limit: 10 });
    seen.push(...page.items.map((p) => p.slug));
    if (!page.hasMore) break;
    cursor = decodeProfileFeedCursor(page.nextCursor);
  }

  assert.equal(seen.length, 23);
  assert.equal(new Set(seen).size, 23);
});

test("pageOwnedPublications clamps an oversized limit and keeps a constant query count", async () => {
  const small = fakeSupabase({ collection_publications: pagePublicationRows(4) });
  const large = fakeSupabase({ collection_publications: pagePublicationRows(400) });
  await new SupabaseProfileStore(small).pageOwnedPublications("owner", { cursor: null, limit: 24 });
  await new SupabaseProfileStore(large).pageOwnedPublications("owner", { cursor: null, limit: 5000 });

  assert.equal(small.calls.length, 1);
  assert.equal(large.calls.length, 1);
  assert.equal(large.calls[0].limit, 101);
});

test("pageOwnedPublications carries embedded counts through", async () => {
  const supabase = fakeSupabase({ collection_publications: pagePublicationRows(1) });
  const page = await new SupabaseProfileStore(supabase).pageOwnedPublications("owner", {
    cursor: null,
    limit: 10,
  });
  assert.equal(page.items[0].itemCount, 3);
  assert.equal(page.items[0].followerCount, 1);
});
