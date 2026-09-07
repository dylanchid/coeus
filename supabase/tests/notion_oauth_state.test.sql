begin;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'oauth-owner@example.test', '', now());

insert into public.notion_oauth_states (nonce, owner_id, expires_at)
values ('a-very-random-nonce-that-is-long-enough', '11111111-1111-1111-1111-111111111111', now() + interval '10 minutes');

select results_eq(
  $$ select public.consume_notion_oauth_state('a-very-random-nonce-that-is-long-enough', '11111111-1111-1111-1111-111111111111') $$,
  array[true], 'consumes a valid state exactly once'
);
select is((select count(*) from public.notion_oauth_states), 0::bigint, 'consumption deletes the state');
select results_eq(
  $$ select public.consume_notion_oauth_state('a-very-random-nonce-that-is-long-enough', '11111111-1111-1111-1111-111111111111') $$,
  array[false], 'a replay cannot consume the state again'
);

insert into public.notion_oauth_states (nonce, owner_id, expires_at)
values ('another-random-nonce-that-is-long-enough', '11111111-1111-1111-1111-111111111111', now() - interval '1 minute');
select results_eq(
  $$ select public.consume_notion_oauth_state('another-random-nonce-that-is-long-enough', '11111111-1111-1111-1111-111111111111') $$,
  array[false], 'an expired state is rejected'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok($$ select * from public.notion_oauth_states $$, '42501', null, 'clients cannot read OAuth states');
select throws_ok(
  $$ select public.consume_notion_oauth_state('a-very-random-nonce-that-is-long-enough', '11111111-1111-1111-1111-111111111111') $$,
  '42501', 'permission denied for function consume_notion_oauth_state', 'clients cannot consume OAuth states directly'
);

select * from finish();
rollback;
