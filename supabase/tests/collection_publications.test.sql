begin;

select plan(21);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.test', '', now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', '', now());

select results_eq(
  $$ select current_revision from public.initialize_archive(
    '11111111-1111-1111-1111-111111111111',
    '{"syncVersion":1,"revision":0,"generatedAt":"2026-09-04T00:00:00.000Z","archive":{"version":1,"items":[],"collections":[],"socialPosts":[]},"entityVersions":{}}'::jsonb
  ) $$,
  array[0::bigint],
  'initializes an archive for the publisher'
);

-- Collection A: exercises the full publish -> republish -> unpublish lifecycle.
select results_eq(
  $$ select slug from public.publish_collection(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    'humane-internet', 'a-humane-internet', 'public'::public.visibility,
    'A humane internet', 'Protocols worth re-reading.', 'A running list.', 'Curated by One',
    '[{"itemLocalId":"a-item-1","position":0,"title":"Cool URIs don''t change","url":"https://example.com/a1","sourceName":"W3C","author":"TBL","excerpt":"","curatorComment":""}]'::jsonb
  ) $$,
  array['a-humane-internet'],
  'publishes collection A at the requested slug'
);

select is((select count(*) from public.collection_publications), 1::bigint, 'creates one publication row');
select is((select count(*) from public.collection_publication_items), 1::bigint, 'creates one publication item row');

select results_eq(
  $$ select slug from public.publish_collection(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    'humane-internet', 'a-completely-different-slug', 'unlisted'::public.visibility,
    'A humane internet', 'Updated description.', 'Updated curator note.', 'Curated by One',
    '[{"itemLocalId":"a-item-1","position":0,"title":"Cool URIs don''t change","url":"https://example.com/a1","sourceName":"W3C","author":"TBL","excerpt":"","curatorComment":""},{"itemLocalId":"a-item-2","position":1,"title":"The Internet is for End Users","url":"https://example.com/a2","sourceName":"RFC Editor","author":"MN","excerpt":"","curatorComment":""}]'::jsonb
  ) $$,
  array['a-humane-internet'],
  'republish keeps the original slug even when a different slug is requested'
);
select is((select visibility::text from public.collection_publications where collection_local_id = 'humane-internet'), 'unlisted', 'republish updates visibility');
select is((select count(*) from public.collection_publication_items where publication_id = (select id from public.collection_publications where collection_local_id = 'humane-internet')), 2::bigint, 'republish replaces items wholesale');

-- Collection B: stays live for the cross-user RLS and follow checks below.
select results_eq(
  $$ select slug from public.publish_collection(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    'tools-for-thought', 'tools-for-thought', 'public'::public.visibility,
    'Tools for thought', 'Interfaces for remembering and connecting.', '', 'Curated by One',
    '[{"itemLocalId":"b-item-1","position":0,"title":"A Brief History of the Digital Garden","url":"https://example.com/b1","sourceName":"Maggie Appleton","author":"","excerpt":"","curatorComment":""}]'::jsonb
  ) $$,
  array['tools-for-thought'],
  'publishes collection B as public with one item'
);

select results_eq(
  $$ select public.unpublish_collection(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    'humane-internet'
  ) $$,
  array[true],
  'unpublish marks collection A withdrawn'
);
select ok(
  (select unpublished_at is not null from public.collection_publications where collection_local_id = 'humane-internet'),
  'unpublish sets unpublished_at'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok($$ select * from public.collection_publications $$, '42501', null, 'a non-owner cannot read publication rows outside the BFF');
select throws_ok($$ select * from public.collection_publications $$, '42501', null, 'unpublished publication rows are also closed by grants');
select throws_ok($$ select * from public.collection_publication_items $$, '42501', null, 'publication item rows are closed by grants');

select throws_ok(
  $$ insert into public.collection_follows (publication_id, follower_id)
     values ((select id from public.collection_publications where collection_local_id = 'tools-for-thought'), '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'a signed-in user cannot follow directly outside the BFF'
);
reset role;
select is((select count(*) from public.collection_follows), 0::bigint, 'a denied direct follow creates no row');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok(
  $$ insert into public.collection_follows (publication_id, follower_id)
     values ((select id from public.collection_publications where collection_local_id = 'tools-for-thought'), '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a user cannot create a follow row for someone else'
);

select throws_ok(
  $$ delete from public.collection_follows where follower_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'a follower cannot unfollow directly outside the BFF'
);
reset role;
select is((select count(*) from public.collection_follows), 0::bigint, 'unfollow removes the row');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok(
  $$ select * from public.publish_collection(
    '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
    'x', 'x', 'public'::public.visibility, 'x', '', '', '', '[]'::jsonb
  ) $$,
  '42501',
  'permission denied for function publish_collection',
  'authenticated clients cannot invoke publish_collection directly'
);
select throws_ok(
  $$ select public.unpublish_collection('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'x') $$,
  '42501',
  'permission denied for function unpublish_collection',
  'authenticated clients cannot invoke unpublish_collection directly'
);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok($$ select * from public.collection_publications $$, '42501', null, 'the owner cannot read unpublished publication rows outside the BFF');

select * from finish();
rollback;
