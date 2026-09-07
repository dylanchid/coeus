begin;

select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.test', '', now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', '', now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'three@example.test', '', now());

insert into public.profiles (id, handle, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'ada', 'Ada'),
  ('22222222-2222-2222-2222-222222222222', 'grace', 'Grace'),
  ('33333333-3333-3333-3333-333333333333', 'kate', 'Kate');

-- Schema ------------------------------------------------------------------
select has_table('public', 'handle_history', 'handle_history table exists');
select has_index('public', 'handle_history', 'handle_history_profile_idx', 'the (profile_id, released_at desc) index exists');

select throws_ok(
  $$ insert into public.handle_history (old_handle, profile_id)
     values ('No Good', '11111111-1111-1111-1111-111111111111') $$,
  '23514', null, 'old_handle enforces the same ^[a-z0-9_]{3,20}$ shape as profiles.handle'
);

insert into public.handle_history (old_handle, profile_id)
  values ('adalovelace', '11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ insert into public.handle_history (old_handle, profile_id)
     values ('adalovelace', '22222222-2222-2222-2222-222222222222') $$,
  '23505', null, 'old_handle is unique — a handle is spoken for while its row exists'
);

-- A released handle cascades away with its profile.
delete from public.handle_history where old_handle = 'adalovelace';

-- handle_available() — the quarantine rule -------------------------------
select ok(
  public.handle_available('brandnew', '11111111-1111-1111-1111-111111111111'),
  'a handle never seen before is available'
);
select ok(
  not public.handle_available('grace', '11111111-1111-1111-1111-111111111111'),
  'a handle currently held by another profile is not available'
);

-- Ada released "oldada" 5 days ago; Grace released "oldgrace" 40 days ago.
insert into public.handle_history (old_handle, profile_id, released_at) values
  ('oldada',   '11111111-1111-1111-1111-111111111111', now() - interval '5 days'),
  ('oldgrace', '22222222-2222-2222-2222-222222222222', now() - interval '40 days');

select ok(
  not public.handle_available('oldada', '22222222-2222-2222-2222-222222222222'),
  'a third party cannot claim a handle released fewer than 30 days ago'
);
select ok(
  public.handle_available('oldada', '11111111-1111-1111-1111-111111111111'),
  'the original owner can reclaim their own released handle immediately'
);
select ok(
  public.handle_available('oldgrace', '33333333-3333-3333-3333-333333333333'),
  'a third party can claim a handle released more than 30 days ago'
);
select ok(
  not public.handle_available('oldada', null),
  'a null claimant is treated as a third party, not as the original owner'
);

delete from public.handle_history where old_handle in ('oldada', 'oldgrace');

-- change_handle() — the atomic swap ------------------------------------
select is(
  (select handle from public.change_handle('11111111-1111-1111-1111-111111111111', 'adanew')),
  'adanew', 'change_handle returns the profile row with the new handle'
);
select is(
  (select handle from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'adanew', 'the profiles row now carries the new handle'
);
select is(
  (select profile_id from public.handle_history where old_handle = 'ada'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'the old handle was released into handle_history in the same call'
);

select is(
  (select handle from public.change_handle('11111111-1111-1111-1111-111111111111', 'adanew')),
  'adanew', 'asking for the handle you already hold is a no-op'
);
select is(
  (select count(*) from public.handle_history where profile_id = '11111111-1111-1111-1111-111111111111'),
  1::bigint, 'the no-op did not write a second history row'
);

-- Grace tries to take Ada's freshly released handle: quarantined.
select throws_ok(
  $$ select public.change_handle('22222222-2222-2222-2222-222222222222', 'ada') $$,
  'HQ001', null, 'change_handle rejects a handle another account released inside the window'
);
select is(
  (select handle from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'grace', 'the rejected change left Grace''s handle untouched (atomic)'
);

-- Kate tries to take Grace's current handle: taken.
select throws_ok(
  $$ select public.change_handle('33333333-3333-3333-3333-333333333333', 'grace') $$,
  '23505', null, 'change_handle rejects a handle another account currently holds'
);

-- Ada reclaims her original handle: allowed immediately, history row cleared.
select is(
  (select handle from public.change_handle('11111111-1111-1111-1111-111111111111', 'ada')),
  'ada', 'the original owner reclaims their handle immediately'
);
select is(
  (select count(*) from public.handle_history where old_handle = 'ada'),
  0::bigint, 'reclaiming a handle removes its retired-redirect row'
);

select * from finish();
rollback;
