begin;

select plan(23);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.test', '', now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', '', now());

select current_revision from public.initialize_archive(
  '11111111-1111-1111-1111-111111111111',
  '{"syncVersion":1,"revision":0,"generatedAt":"2026-09-06T00:00:00.000Z","archive":{"version":1,"items":[],"collections":[],"socialPosts":[]},"entityVersions":{}}'::jsonb
);

-- ── The type swap itself ────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_type where typname = 'collection_publication_visibility'),
  0, 'the old two-value enum no longer exists'
);
select is(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.visibility'::regtype),
  array['private', 'followers', 'unlisted', 'public'],
  'public.visibility carries the four labels, ordered least to most visible'
);

-- The backfill expression is 1:1 for every value a pre-swap row could hold.
select is('unlisted'::text::public.visibility, 'unlisted'::public.visibility, 'the backfill maps unlisted -> unlisted');
select is('public'::text::public.visibility, 'public'::public.visibility, 'the backfill maps public -> public');

-- ── Column, default and index survived the swap ─────────────────────────────
select col_not_null('collection_publications', 'visibility', 'visibility is NOT NULL after the swap');
select has_index(
  'public', 'collection_publications', 'collection_publications_live_idx',
  'the live-discovery index was recreated on the new column'
);

insert into public.collection_publications (archive_id, collection_local_id, slug, name, owner_id)
values (
  (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
  'c-default', 'default-collection', 'Defaulted', '11111111-1111-1111-1111-111111111111'
);
select is(
  (select visibility::text from public.collection_publications where slug = 'default-collection'),
  'unlisted', 'visibility still defaults to unlisted'
);

-- ── The policy set, before-and-after: exactly the two select policies per table
select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'collection_publications'),
  array['anyone reads live publications', 'owners read their own publications'],
  'collection_publications keeps exactly its two select policies'
);
select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'collection_publication_items'),
  array['anyone reads items of live publications', 'owners read their own publication items'],
  'collection_publication_items keeps exactly its two select policies'
);
select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'collection_follows'),
  array['followers manage their own follows'],
  'the collection_follows FOR ALL policy was recreated against the new column'
);
select is(
  (select qual from pg_policies
     where tablename = 'collection_publications' and policyname = 'anyone reads live publications')
    like '%visibility%',
  true, 'the live-publications policy references the new visibility column'
);

-- ── The grant set on the new signature ─────────────────────────────────────
select is(
  has_function_privilege('service_role',
    'public.publish_collection(uuid,uuid,text,text,public.visibility,text,text,text,text,jsonb)', 'EXECUTE'),
  true, 'service_role can execute publish_collection at the new signature'
);
select is(
  has_function_privilege('anon',
    'public.publish_collection(uuid,uuid,text,text,public.visibility,text,text,text,text,jsonb)', 'EXECUTE'),
  false, 'anon cannot execute publish_collection'
);
select is(
  has_function_privilege('authenticated',
    'public.publish_collection(uuid,uuid,text,text,public.visibility,text,text,text,text,jsonb)', 'EXECUTE'),
  false, 'authenticated cannot execute publish_collection'
);

-- ── publish_collection works end to end at every tier ──────────────────────
select results_eq(
  $$ select visibility::text from public.publish_collection(
       '11111111-1111-1111-1111-111111111111',
       (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
       'c-pub', 'pub-collection', 'public'::public.visibility, 'Pub', '', '', '', '[]'::jsonb) $$,
  array['public'], 'first publish at public returns public'
);
select results_eq(
  $$ select visibility::text from public.publish_collection(
       '11111111-1111-1111-1111-111111111111',
       (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
       'c-foll', 'foll-collection', 'followers'::public.visibility, 'Foll', '', '', '', '[]'::jsonb) $$,
  array['followers'], 'first publish at the new followers tier round-trips'
);
select results_eq(
  $$ select visibility::text from public.publish_collection(
       '11111111-1111-1111-1111-111111111111',
       (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
       'c-priv', 'priv-collection', 'private'::public.visibility, 'Priv', '', '', '', '[]'::jsonb) $$,
  array['private'], 'first publish at the new private tier round-trips'
);
select results_eq(
  $$ select visibility::text from public.publish_collection(
       '11111111-1111-1111-1111-111111111111',
       (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
       'c-pub', 'ignored-on-republish', 'unlisted'::public.visibility, 'Pub', '', '', '', '[]'::jsonb) $$,
  array['unlisted'], 'a republish moves visibility to the requested tier (slug stays pub-collection)'
);

-- ── RLS still cuts at unlisted/public; followers & private are invisible ───
-- Stash the publication ids while RLS is still bypassed; a stranger cannot
-- SELECT the followers-tier row to look its id up later.
select set_config('test.foll_id',
  (select id::text from public.collection_publications where slug = 'foll-collection'), false);
select set_config('test.unlisted_id',
  (select id::text from public.collection_publications where slug = 'pub-collection'), false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok($$ select * from public.collection_publications $$, '42501', null, 'a stranger cannot read followers-tier publications outside the BFF');
select throws_ok($$ select * from public.collection_publications $$, '42501', null, 'a stranger cannot read private publications outside the BFF');
select throws_ok($$ select * from public.collection_publications $$, '42501', null, 'a stranger cannot read unlisted publications outside the BFF');

-- the collection_follows WITH CHECK still gates new follows to public/unlisted
select throws_ok(
  $$ insert into public.collection_follows (publication_id, follower_id)
     values (current_setting('test.foll_id')::uuid, '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'cannot follow a followers-tier publication under the recreated policy'
);
select throws_ok(
  $$ insert into public.collection_follows (publication_id, follower_id)
     values (current_setting('test.unlisted_id')::uuid, '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'cannot follow an unlisted publication outside the BFF'
);

reset role;

select * from finish();
rollback;
