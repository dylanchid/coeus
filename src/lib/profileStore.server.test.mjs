import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseProfileStore } from "./profileStore.server.ts";

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
