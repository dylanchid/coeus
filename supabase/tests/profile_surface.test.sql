begin;

select plan(24);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.test', '', now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', '', now());

-- A pre-existing profile row survives the migration at the new defaults ------
insert into public.profiles (id, handle, display_name)
values ('11111111-1111-1111-1111-111111111111', 'ada', 'Ada Lovelace');

select is((select links from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  '[]'::jsonb, 'links defaults to an empty array');
select is((select pinned_collection_slugs from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  '{}'::text[], 'pinned_collection_slugs defaults to an empty array');
select is((select avatar_url from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  null, 'avatar_url defaults to null');
select is((select cover_url from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  null, 'cover_url defaults to null (render the generative cover)');

-- location ----------------------------------------------------------------
select throws_ok(
  $$ update public.profiles set location = repeat('x', 81) where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'rejects a location longer than 80 characters'
);
select lives_ok(
  $$ update public.profiles set location = repeat('x', 80) where id = '11111111-1111-1111-1111-111111111111' $$,
  'accepts a location of exactly 80 characters'
);

-- links shape -----------------------------------------------------------
select throws_ok(
  $$ update public.profiles set links = '[
      {"label":"1","url":"https://a.example"},
      {"label":"2","url":"https://b.example"},
      {"label":"3","url":"https://c.example"},
      {"label":"4","url":"https://d.example"},
      {"label":"5","url":"https://e.example"},
      {"label":"6","url":"https://f.example"}
     ]'::jsonb where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'rejects a links array with six entries'
);
select throws_ok(
  $$ update public.profiles set links = '{"label":"1","url":"https://a.example"}'::jsonb
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'rejects a non-array links value'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label":"missing url"}]'::jsonb
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'rejects a links entry with no url'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label":"","url":"https://a.example"}]'::jsonb
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'rejects a links entry with an empty label'
);
select throws_ok(
  $$ update public.profiles set links = '[{"label":"scheme","url":"ftp://a.example"}]'::jsonb
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'rejects a links entry whose url is not http(s)'
);
select lives_ok(
  $$ update public.profiles set links = '[{"label":"Site","url":"https://ada.example"},{"label":"Notes","url":"http://notes.example"}]'::jsonb
     where id = '11111111-1111-1111-1111-111111111111' $$,
  'accepts a well-formed links array of two entries'
);

-- avatar / cover URL must sit inside the profile-media bucket -------------
select throws_ok(
  $$ update public.profiles set avatar_url = 'https://evil.example/avatar.png'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'rejects an avatar_url outside the profile-media bucket'
);
select lives_ok(
  $$ update public.profiles
     set avatar_url = 'http://localhost:54321/storage/v1/object/public/profile-media/11111111-1111-1111-1111-111111111111/avatar-abc.png'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  'accepts an avatar_url inside the profile-media bucket'
);

-- B. collection_publications.owner_id -----------------------------------
select col_not_null('collection_publications', 'owner_id', 'owner_id is NOT NULL');

select current_revision from public.initialize_archive(
  '11111111-1111-1111-1111-111111111111',
  '{"syncVersion":1,"revision":0,"generatedAt":"2026-09-06T00:00:00.000Z","archive":{"version":1,"items":[],"collections":[],"socialPosts":[]},"entityVersions":{}}'::jsonb
);

select publish_collection(
  '11111111-1111-1111-1111-111111111111',
  (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
  'c-one', 'owner-collection-one', 'public'::public.visibility,
  'Owner Collection One', '', '', '', '[]'::jsonb
);

select is(
  (select owner_id from public.collection_publications where slug = 'owner-collection-one'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'publish_collection sets owner_id to the archive owner on first publish'
);

-- republish the same collection: owner_id must not move
select publish_collection(
  '11111111-1111-1111-1111-111111111111',
  (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
  'c-one', 'ignored-on-republish', 'unlisted'::public.visibility,
  'Owner Collection One', 'edited', '', '', '[]'::jsonb
);
select is(
  (select owner_id from public.collection_publications where slug = 'owner-collection-one'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'a republish leaves owner_id unchanged'
);

-- the backfill invariant: every publication row's owner_id equals its archive owner
select is(
  (select count(*) from public.collection_publications p
     left join public.archives a on a.id = p.archive_id
    where p.owner_id is distinct from a.owner_id),
  0::bigint,
  'every collection_publications.owner_id matches archives.owner_id'
);

select has_index(
  'public', 'collection_publications', 'collection_publications_owner_live_idx',
  'the (owner_id, published_at desc) partial index exists'
);

-- C. profile-media storage bucket -------------------------------------
select is(
  (select public from storage.buckets where id = 'profile-media'),
  true,
  'the profile-media bucket exists and is public'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('profile-media', '11111111-1111-1111-1111-111111111111/avatar-self.png') $$,
  'an account can write under its own uid prefix'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('profile-media', '22222222-2222-2222-2222-222222222222/avatar-other.png') $$,
  '42501', null, 'an account cannot write under another account''s uid prefix'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', null, true);

select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media'),
  1::bigint,
  'an anonymous reader can see objects in the public bucket'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('profile-media', 'anon/avatar.png') $$,
  '42501', null, 'an anonymous request cannot write an object'
);

reset role;

select * from finish();
rollback;
