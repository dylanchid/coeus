begin;

select plan(24);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author@example.test', '', now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@example.test', '', now());

insert into public.profiles (id, handle, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'author', 'Author'),
  ('22222222-2222-2222-2222-222222222222', 'stranger', 'Stranger');

-- ── shape ───────────────────────────────────────────────────────────────────
select has_table('public', 'posts', 'the posts table exists');
select has_index('public', 'posts', 'posts_author_live_idx', 'the author / created_at listing index exists');

insert into public.posts (author_id, item_local_id, title, url)
values ('11111111-1111-1111-1111-111111111111', 'seed-default', 'Seed', 'https://example.com/seed');
select is(
  (select visibility::text from public.posts where item_local_id = 'seed-default'),
  'private', 'a post row created without a visibility is private, never public'
);

-- ── policy set: exactly the two select policies, no write policy ─────────────
select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'posts'),
  array['anyone reads unlisted or public posts', 'authors read their own posts'],
  'posts carries exactly its two select policies'
);
select is(
  (select array_agg(distinct cmd::text) from pg_policies
     where schemaname = 'public' and tablename = 'posts'),
  array['SELECT'],
  'every posts policy is SELECT-only — inserts/updates/deletes have no policy'
);

-- ── grant set on the two RPCs ───────────────────────────────────────────────
select is(
  has_function_privilege('service_role',
    'public.publish_post(uuid,text,public.visibility,text,text,text,text,text,text)', 'EXECUTE'),
  true, 'service_role can execute publish_post'
);
select is(
  has_function_privilege('anon',
    'public.publish_post(uuid,text,public.visibility,text,text,text,text,text,text)', 'EXECUTE'),
  false, 'anon cannot execute publish_post'
);
select is(
  has_function_privilege('authenticated',
    'public.publish_post(uuid,text,public.visibility,text,text,text,text,text,text)', 'EXECUTE'),
  false, 'authenticated cannot execute publish_post'
);
select is(
  has_function_privilege('service_role', 'public.unpublish_post(uuid,text)', 'EXECUTE'),
  true, 'service_role can execute unpublish_post'
);
select is(
  has_function_privilege('authenticated', 'public.unpublish_post(uuid,text)', 'EXECUTE'),
  false, 'authenticated cannot execute unpublish_post'
);

-- ── owner guard ─────────────────────────────────────────────────────────────
select throws_ok(
  $$ select public.publish_post(
       '33333333-3333-3333-3333-333333333333', 'x', 'public'::public.visibility,
       'T', 'https://example.com/x', '', '', '', '') $$,
  'P0001', 'Profile not found for owner',
  'publish_post refuses to write a post for an author_id with no profile behind it'
);

-- ── publish, then republish the same clip ───────────────────────────────────
select lives_ok(
  $$ select public.publish_post(
       '11111111-1111-1111-1111-111111111111', 'clip-1', 'unlisted'::public.visibility,
       'First', 'https://example.com/1', 'Src', 'A. Uthor', 'excerpt', 'my note') $$,
  'the first publish_post of a clip succeeds'
);
select lives_ok(
  $$ select public.publish_post(
       '11111111-1111-1111-1111-111111111111', 'clip-1', 'public'::public.visibility,
       'First, revised', 'https://example.com/1', 'Src', 'A. Uthor', 'excerpt', 'my note v2') $$,
  'a republish of the same (author_id, item_local_id) succeeds'
);
select is(
  (select count(*) from public.posts
     where author_id = '11111111-1111-1111-1111-111111111111' and item_local_id = 'clip-1'),
  1::bigint, 'the republish updated in place rather than inserting a duplicate'
);
select is(
  (select title from public.posts
     where author_id = '11111111-1111-1111-1111-111111111111' and item_local_id = 'clip-1'),
  'First, revised', 'the republish overwrote the mutable fields'
);
select is(
  (select visibility::text from public.posts
     where author_id = '11111111-1111-1111-1111-111111111111' and item_local_id = 'clip-1'),
  'public', 'the republish moved the visibility tier'
);

-- ── unpublish ──────────────────────────────────────────────────────────────
select is(
  (select public.unpublish_post('11111111-1111-1111-1111-111111111111', 'clip-1')),
  true, 'unpublish_post reports that it removed a row'
);
select is(
  (select public.unpublish_post('11111111-1111-1111-1111-111111111111', 'clip-1')),
  false, 'a second unpublish_post of the same clip is a no-op'
);

-- ── RLS cuts at unlisted/public; followers & private need canSee ────────────
select public.publish_post('11111111-1111-1111-1111-111111111111', 'p-public', 'public'::public.visibility, 'Pub', 'https://example.com/pub', '', '', '', '');
select public.publish_post('11111111-1111-1111-1111-111111111111', 'p-unlisted', 'unlisted'::public.visibility, 'Unl', 'https://example.com/unl', '', '', '', '');
select public.publish_post('11111111-1111-1111-1111-111111111111', 'p-followers', 'followers'::public.visibility, 'Fol', 'https://example.com/fol', '', '', '', '');
select public.publish_post('11111111-1111-1111-1111-111111111111', 'p-private', 'private'::public.visibility, 'Priv', 'https://example.com/priv', '', '', '', '');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(
  (select count(*) from public.posts where item_local_id = 'p-public'),
  1::bigint, 'a stranger reads a public post through RLS'
);
select is(
  (select count(*) from public.posts where item_local_id = 'p-unlisted'),
  1::bigint, 'a stranger reads an unlisted post through RLS — canSee narrows listings, not this'
);
select is(
  (select count(*) from public.posts where item_local_id = 'p-followers'),
  0::bigint, 'a stranger cannot read a followers-tier post through RLS'
);
select is(
  (select count(*) from public.posts where item_local_id = 'p-private'),
  0::bigint, 'a stranger cannot read a private post through RLS'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is(
  (select count(*) from public.posts where item_local_id = 'p-private'),
  1::bigint, 'the author reads their own private post through RLS'
);
select throws_ok(
  $$ insert into public.posts (author_id, item_local_id, title, url)
     values ('11111111-1111-1111-1111-111111111111', 'direct', 'X', 'https://example.com/x') $$,
  '42501', null,
  'even the author cannot INSERT a post directly — writes go through publish_post'
);
reset role;

select * from finish();
rollback;
