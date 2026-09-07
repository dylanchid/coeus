begin;

select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lease@example.test', '', now());

select public.initialize_archive(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"syncVersion":1,"revision":0,"generatedAt":"2026-09-07T00:00:00.000Z","archive":{"version":1,"items":[],"collections":[],"socialPosts":[]},"entityVersions":{}}'::jsonb
);

select public.create_destination(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  (select id from public.archives where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'notion'::public.destination_kind,
  'Notion',
  '{"databaseId":"db-1","workspaceName":"WS"}'::jsonb,
  convert_to('c', 'utf8'), convert_to('i', 'utf8'), convert_to('t', 'utf8')
);

-- A caller who does not own the archive is rejected.
select throws_ok(
  $$ select public.acquire_destination_delivery_lease(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '00000000-0000-0000-0000-000000000000',
    'notion'::public.destination_kind, gen_random_uuid(), 120, 30
  ) $$,
  'P0001', 'Archive not found for owner',
  'acquire rejects a caller who does not own the archive'
);

-- First acquisition wins.
select ok(
  public.acquire_destination_delivery_lease(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id from public.archives where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'notion'::public.destination_kind, '11111111-0000-0000-0000-000000000001', 120, 30
  ),
  'first run acquires the lease'
);
select is((select delivery_lease_token from public.destinations where kind = 'notion'),
  '11111111-0000-0000-0000-000000000001'::uuid, 'the lease token is stored');
select isnt((select delivery_started_at from public.destinations where kind = 'notion'), null,
  'delivery_started_at is set on acquire');

-- A concurrent run with a different token is denied while the lease is live.
select ok(
  not public.acquire_destination_delivery_lease(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id from public.archives where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'notion'::public.destination_kind, '11111111-0000-0000-0000-000000000002', 120, 30
  ),
  'a second overlapping run is denied the lease'
);

-- Releasing with the wrong token is a no-op.
select ok(
  not public.release_destination_delivery_lease(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id from public.archives where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'notion'::public.destination_kind, '11111111-0000-0000-0000-000000000002', '{}'::jsonb
  ),
  'release with a mismatched token does nothing'
);
select is((select delivery_lease_token from public.destinations where kind = 'notion'),
  '11111111-0000-0000-0000-000000000001'::uuid, 'the live lease survives a mismatched release');

-- Releasing with the right token frees the lease and records the outcome.
select ok(
  public.release_destination_delivery_lease(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id from public.archives where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'notion'::public.destination_kind, '11111111-0000-0000-0000-000000000001',
    '{"status":"delivered","delivered":3}'::jsonb
  ),
  'release with the held token frees the lease'
);
select is((select delivery_lease_token from public.destinations where kind = 'notion'), null,
  'the lease token is cleared on release');
select is((select delivery_last_outcome->>'status' from public.destinations where kind = 'notion'),
  'delivered', 'the run outcome is recorded');

-- The minimum-interval rate limit blocks an immediate re-acquire.
select ok(
  not public.acquire_destination_delivery_lease(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id from public.archives where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'notion'::public.destination_kind, gen_random_uuid(), 120, 3600
  ),
  'a re-acquire inside the minimum interval is rate-limited'
);

-- With a zero interval (a user-initiated manual sync) it can re-acquire.
select ok(
  public.acquire_destination_delivery_lease(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id from public.archives where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'notion'::public.destination_kind, gen_random_uuid(), 120, 0
  ),
  'a manual sync (interval 0) re-acquires immediately'
);

select * from finish();
rollback;
