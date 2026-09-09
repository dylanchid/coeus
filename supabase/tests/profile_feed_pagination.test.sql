begin;

select plan(4);

-- bareaga_web-p5o: the profile Collections / Posts tabs page through a keyset
-- cursor, which needs a composite index whose leading columns match the
-- ORDER BY exactly — (owner_id, published_at desc, id desc) for collections and
-- (author_id, created_at desc, id desc) for posts.

select has_index(
  'public', 'collection_publications', 'collection_publications_owner_page_idx',
  'the (owner_id, published_at desc, id desc) keyset index exists'
);

select is(
  (select indexdef like '%id DESC%'
     from pg_indexes
    where schemaname = 'public' and indexname = 'collection_publications_owner_page_idx'),
  true,
  'the collections keyset index carries the id tiebreaker'
);

select has_index(
  'public', 'posts', 'posts_author_live_idx',
  'the posts author listing index still exists after the swap'
);

select is(
  (select indexdef like '%id DESC%'
     from pg_indexes
    where schemaname = 'public' and indexname = 'posts_author_live_idx'),
  true,
  'the posts listing index now carries the id tiebreaker'
);

select * from finish();

rollback;
