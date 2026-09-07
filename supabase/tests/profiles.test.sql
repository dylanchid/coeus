begin;

select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.test', '', now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', '', now());

-- Constraints ---------------------------------------------------------------
select throws_ok(
  $$ insert into public.profiles (id, handle, display_name)
     values ('11111111-1111-1111-1111-111111111111', 'ab', 'Too Short') $$,
  '23514', null, 'rejects a handle shorter than three characters'
);

select throws_ok(
  $$ insert into public.profiles (id, handle, display_name)
     values ('11111111-1111-1111-1111-111111111111', 'Has Spaces', 'Bad') $$,
  '23514', null, 'rejects a handle with disallowed characters'
);

select throws_ok(
  $$ insert into public.profiles (id, handle, display_name, bio)
     values ('11111111-1111-1111-1111-111111111111', 'okhandle', 'Fine', repeat('x', 281)) $$,
  '23514', null, 'rejects a bio longer than 280 characters'
);

insert into public.profiles (id, handle, display_name)
values ('11111111-1111-1111-1111-111111111111', 'ada', 'Ada Lovelace');
select is((select count(*) from public.profiles), 1::bigint, 'accepts a valid profile');

select throws_ok(
  $$ insert into public.profiles (id, handle, display_name)
     values ('22222222-2222-2222-2222-222222222222', 'ada', 'Ada Impostor') $$,
  '23505', null, 'enforces a unique handle across accounts'
);

-- updated_at trigger ------------------------------------------------------
update public.profiles
  set created_at = now() - interval '1 hour', updated_at = now() - interval '1 hour'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Ada L.'
  where id = '11111111-1111-1111-1111-111111111111';
select ok(
  (select updated_at > created_at from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'the trigger advances updated_at on write'
);

-- RLS -------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok($$ select * from public.profiles $$, '42501', null, 'authenticated readers cannot see raw profiles outside the BFF');

select throws_ok(
  $$ insert into public.profiles (id, handle, display_name)
     values ('11111111-1111-1111-1111-111111111111', 'notmine', 'Spoofed') $$,
  '42501',
  'permission denied for table profiles',
  'a user cannot create a profile for another account outside the BFF'
);

select throws_ok(
  $$ insert into public.profiles (id, handle, display_name)
     values ('22222222-2222-2222-2222-222222222222', 'grace', 'Grace Hopper') $$,
  '42501', null, 'a user cannot create their own profile outside the BFF'
);

select throws_ok(
  $$ update public.profiles set display_name = 'Hacked'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'an update targeting another account is denied outside the BFF'
);

select * from finish();
rollback;
