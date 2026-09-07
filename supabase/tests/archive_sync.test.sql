begin;

select plan(12);

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
  'initializes revision zero'
);

select is((select count(*) from public.archives), 1::bigint, 'creates one archive');
select is((select count(*) from public.archive_revisions), 1::bigint, 'creates one initial revision');

select results_eq(
  $$ select committed from public.commit_archive_sync(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    0,
    '{"syncVersion":1,"revision":1,"generatedAt":"2026-09-04T00:01:00.000Z","archive":{"version":1,"items":[],"collections":[],"socialPosts":[]},"entityVersions":{}}'::jsonb,
    '[{"operationId":"op-1","clientId":"device-a","baseRevision":0,"operation":{"operationId":"op-1"},"accepted":true,"conflicts":[]}]'::jsonb
  ) $$,
  array[true],
  'commits a compare-and-swap revision'
);

select is((select current_revision from public.archives), 1::bigint, 'advances the archive pointer');
select is((select count(*) from public.archive_revisions), 2::bigint, 'retains immutable revision history');
select is((select count(*) from public.archive_operations), 1::bigint, 'records an idempotency key');

select results_eq(
  $$ select committed from public.commit_archive_sync(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    0,
    '{"syncVersion":1,"revision":1,"generatedAt":"2026-09-04T00:02:00.000Z","archive":{"version":1,"items":[],"collections":[],"socialPosts":[]},"entityVersions":{}}'::jsonb,
    '[]'::jsonb
  ) $$,
  array[false],
  'rejects a stale compare-and-swap'
);

select is((select count(*) from public.archive_revisions), 2::bigint, 'stale commits do not create revisions');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok($$ select * from public.archives $$, '42501', null, 'the owner cannot read archive rows outside the BFF');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select throws_ok($$ select * from public.archives $$, '42501', null, 'another user cannot read archive rows outside the BFF');

select throws_ok(
  $$ select * from public.commit_archive_sync(
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000', 0, '{}'::jsonb, '[]'::jsonb
  ) $$,
  '42501',
  'permission denied for function commit_archive_sync',
  'authenticated clients cannot invoke the commit function'
);

select * from finish();
rollback;
