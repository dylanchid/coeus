-- Follow-up to the bt0 bounding slice (docs/profile-page-plan.md): the profile
-- Collections and Posts tabs move from a single capped load to forward-only
-- cursor pagination (bareaga_web-p5o).
--
-- A stable keyset cursor orders by the timestamp AND the row id as a
-- tiebreaker, so two rows sharing a published_at / created_at still have a
-- total order and a page boundary can never split or repeat them. That needs a
-- composite index whose leading columns match the ORDER BY exactly.
--
--   collections: (owner_id, published_at desc, id desc)
--   posts:       (author_id, created_at desc, id desc)
--
-- The existing collection_publications_owner_live_idx is PARTIAL
-- (where unpublished_at is null) and cannot serve the owner's own tab, which
-- lists unpublished rows too; posts_author_live_idx lacks the id tiebreaker.

create index collection_publications_owner_page_idx
  on public.collection_publications (owner_id, published_at desc, id desc);

comment on index public.collection_publications_owner_page_idx is
  'Keyset-pagination index for the profile Collections tab: (owner_id, published_at desc, id desc). Non-partial so it also covers the owner viewing their own unpublished rows.';

drop index if exists public.posts_author_live_idx;

create index posts_author_live_idx
  on public.posts (author_id, created_at desc, id desc);

comment on index public.posts_author_live_idx is
  'Keyset-pagination index for the profile Posts tab: (author_id, created_at desc, id desc). The id column is the cursor tiebreaker for posts sharing a created_at.';
