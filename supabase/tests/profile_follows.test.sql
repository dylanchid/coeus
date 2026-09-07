begin;

select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@example.test', '', now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@example.test',   '', now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol@example.test', '', now()),
  -- an account that follows before completing onboarding: no profiles row.
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dave@example.test',  '', now());

insert into public.profiles (id, handle, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'alice', 'Alice'),
  ('22222222-2222-2222-2222-222222222222', 'bob',   'Bob'),
  ('33333333-3333-3333-3333-333333333333', 'carol', 'Carol');

-- ── shape ───────────────────────────────────────────────────────────────────
select has_table('public', 'profile_follows', 'the profile_follows table exists');
select has_index('public', 'profile_follows', 'profile_follows_followee_idx',
  'the (followee_id, created_at desc) count / listing index exists');
select has_index('public', 'profile_follows', 'profile_follows_follower_idx',
  'the (follower_id, created_at desc) count / listing index exists');

-- ── check constraints ───────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.profile_follows (follower_id, followee_id)
     values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111') $$,
  '23514', null, 'a self-follow is rejected by the check constraint'
);
select throws_ok(
  $$ update public.profiles set likes_visibility = 'unlisted'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'likes_visibility rejects unlisted — unlisted is meaningless for a list'
);
select is(
  (select likes_visibility::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'public', 'likes_visibility defaults to public'
);
select is(
  (select array[show_followers, show_following, show_reposts, show_replies, show_likes]
     from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  array[true, true, true, true, true],
  'every show_* switch defaults to true'
);
select lives_ok(
  $$ update public.profiles set likes_visibility = 'followers'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  'likes_visibility accepts the followers tier'
);

-- ── policy set: the FOR ALL write policy plus a permissive SELECT policy ─────
select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'profile_follows'),
  array['anyone reads profile follows', 'followers manage their own profile follows'],
  'profile_follows carries exactly its two policies'
);
select is(
  (select array_agg(cmd::text order by cmd) from pg_policies
     where schemaname = 'public' and tablename = 'profile_follows'),
  array['ALL', 'SELECT'],
  'one FOR ALL write policy and one SELECT read policy'
);

-- ── the follow edge: idempotency at the DB boundary ─────────────────────────
insert into public.profile_follows (follower_id, followee_id)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$ insert into public.profile_follows (follower_id, followee_id)
     values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  '23505', null, 'a duplicate follow violates the primary key'
);
select lives_ok(
  $$ insert into public.profile_follows (follower_id, followee_id)
     values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
     on conflict do nothing $$,
  'a duplicate follow with ON CONFLICT DO NOTHING is a no-op — the follow RPC uses this'
);
select is(
  (select count(*) from public.profile_follows
     where follower_id = '11111111-1111-1111-1111-111111111111'
       and followee_id = '22222222-2222-2222-2222-222222222222'),
  1::bigint, 'the row is still there exactly once'
);

-- ── RLS: a follower writes only their own rows ──────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select throws_ok(
  $$ insert into public.profile_follows (follower_id, followee_id)
     values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'bob cannot create a follow on alice''s behalf'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$ insert into public.profile_follows (follower_id, followee_id)
     values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'alice cannot create a follow directly outside the BFF'
);
reset role;
insert into public.profile_follows (follower_id, followee_id)
values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333');

-- ── RLS: the permissive SELECT policy exposes counts to a stranger ──────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select throws_ok($$ select * from public.profile_follows $$, '42501', null, 'a stranger cannot read the follow graph outside the BFF');
reset role;

-- ── a follower with no profile row (followed before onboarding) ─────────────
-- follower_id references auth.users, not profiles, so this insert must succeed.
select lives_ok(
  $$ insert into public.profile_follows (follower_id, followee_id)
     values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333') $$,
  'an account with no profiles row can still follow'
);
select is(
  (select count(*) from public.profile_follows where followee_id = '33333333-3333-3333-3333-333333333333'),
  2::bigint, 'the raw follower count for carol includes the profile-less follower'
);
-- The app renders and counts followers via an inner join to profiles, so the
-- profile-less follower drops out of BOTH — the list and the figure agree.
select is(
  (select count(*)
     from public.profile_follows f
     join public.profiles p on p.id = f.follower_id
    where f.followee_id = '33333333-3333-3333-3333-333333333333'),
  1::bigint, 'joined to profiles, carol has one renderable follower — count matches the list'
);
select is(
  (select p.handle
     from public.profile_follows f
     join public.profiles p on p.id = f.follower_id
    where f.followee_id = '33333333-3333-3333-3333-333333333333'),
  'alice', 'the renderable follower is the one with a profile'
);

-- ── cascade on delete ──────────────────────────────────────────────────────
-- a follow into bob from an account that survives the follower-cascade test
insert into public.profile_follows (follower_id, followee_id)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222');

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*) from public.profile_follows
     where follower_id = '11111111-1111-1111-1111-111111111111'),
  0::bigint, 'deleting an account removes its outgoing follows (follower_id -> auth.users)'
);

delete from public.profiles where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*) from public.profile_follows
     where followee_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint, 'deleting a profile removes its incoming follows (followee_id -> profiles)'
);

select * from finish();
rollback;
