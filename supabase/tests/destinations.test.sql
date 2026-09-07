begin;

select plan(36);

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
  'initializes archive one'
);
select results_eq(
  $$ select current_revision from public.initialize_archive(
    '22222222-2222-2222-2222-222222222222',
    '{"syncVersion":1,"revision":0,"generatedAt":"2026-09-04T00:00:00.000Z","archive":{"version":1,"items":[],"collections":[],"socialPosts":[]},"entityVersions":{}}'::jsonb
  ) $$,
  array[0::bigint],
  'initializes archive two'
);

select results_eq(
  $$ select display_name from public.create_destination(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    'obsidian_git'::public.destination_kind,
    'My Vault',
    '{"repo":"acme/vault","branch":"main","pathPrefix":"bareaga"}'::jsonb,
    convert_to('ciphertext-v1', 'utf8'),
    convert_to('iv-v1', 'utf8'),
    convert_to('tag-v1', 'utf8')
  ) $$,
  array['My Vault'],
  'creates a destination and returns its display name'
);
select is((select count(*) from public.destinations), 1::bigint, 'creates one destination row');
select is((select status::text from public.destinations where kind = 'obsidian_git'), 'active', 'defaults to active status');

select throws_ok(
  $$ select public.create_destination(
    '22222222-2222-2222-2222-222222222222',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    'notion'::public.destination_kind, 'Not mine', '{}'::jsonb, null, null, null
  ) $$,
  'P0001',
  'Archive not found for owner',
  'create_destination rejects a caller who does not own the archive'
);

select lives_ok(
  $$ select public.record_delivery_outcome(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    'obsidian_git'::public.destination_kind,
    'item-1', 'articles/item-1.md', 3, 'delivered'::public.destination_delivery_status, 200, null
  ) $$,
  'records a delivered outcome'
);
select is((select last_delivered_revision from public.destination_deliveries where item_id = 'item-1'), 3::bigint, 'stores the delivered revision');
select is((select external_ref from public.destination_deliveries where item_id = 'item-1'), 'articles/item-1.md', 'stores the external ref');
select is((select count(*) from public.destination_delivery_attempts), 1::bigint, 'logs one delivery attempt');

select lives_ok(
  $$ select public.record_delivery_outcome(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    'obsidian_git'::public.destination_kind,
    'item-1', null, 999, 'failed_retryable'::public.destination_delivery_status, 500, 'boom'
  ) $$,
  'records a failed retry outcome for the same item'
);
select is((select last_delivered_revision from public.destination_deliveries where item_id = 'item-1'), 3::bigint, 'a failed attempt does not advance the delivered revision');
select is((select external_ref from public.destination_deliveries where item_id = 'item-1'), 'articles/item-1.md', 'a failed attempt preserves the prior external ref');
select is((select status::text from public.destination_deliveries where item_id = 'item-1'), 'failed_retryable', 'records the failure status');
select is((select count(*) from public.destination_delivery_attempts), 2::bigint, 'logs a second delivery attempt');

select is((select public.mark_destination_status(
  '11111111-1111-1111-1111-111111111111',
  (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
  'obsidian_git'::public.destination_kind, 'auth_error'::public.destination_status
)), true, 'marks the destination auth_error');
select is((select status::text from public.destinations where kind = 'obsidian_git'), 'auth_error', 'destination status reflects auth_error');

select is((select public.disconnect_destination(
  '11111111-1111-1111-1111-111111111111',
  (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
  'obsidian_git'::public.destination_kind
)), true, 'disconnects the destination');
select is((select secret_ciphertext from public.destinations where kind = 'obsidian_git'), null, 'disconnect clears the secret ciphertext');
select is((select status::text from public.destinations where kind = 'obsidian_git'), 'disabled', 'disconnect sets status to disabled');
select is((select count(*) from public.destination_deliveries where item_id = 'item-1'), 1::bigint, 'disconnect preserves delivery history');

select results_eq(
  $$ select display_name from public.create_destination(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    'obsidian_git'::public.destination_kind,
    'My Vault (reconnected)',
    '{"repo":"acme/vault","branch":"main","pathPrefix":"bareaga"}'::jsonb,
    convert_to('ciphertext-v2', 'utf8'),
    convert_to('iv-v2', 'utf8'),
    convert_to('tag-v2', 'utf8')
  ) $$,
  array['My Vault (reconnected)'],
  'reconnecting the same (archive, kind) updates the existing row'
);
select is((select count(*) from public.destinations), 1::bigint, 'reconnect does not duplicate the destination row');
select is((select secret_version from public.destinations where kind = 'obsidian_git'), 2::int, 'reconnect increments the secret version');
select is((select external_ref from public.destination_deliveries where item_id = 'item-1'), 'articles/item-1.md', 'reconnect preserves prior delivery external refs');

select is((select public.purge_destination(
  '11111111-1111-1111-1111-111111111111',
  (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
  'obsidian_git'::public.destination_kind
)), true, 'purges the destination');
select is((select count(*) from public.destinations), 0::bigint, 'purge removes the destination row');
select is((select count(*) from public.destination_deliveries), 0::bigint, 'purge cascades to delivery rows');
select is((select count(*) from public.destination_delivery_attempts), 0::bigint, 'purge cascades to delivery attempt rows');

-- Archive-level cascade: deleting the owning archive removes its destinations.
select lives_ok(
  $$ select public.create_destination(
    '22222222-2222-2222-2222-222222222222',
    (select id from public.archives where owner_id = '22222222-2222-2222-2222-222222222222'),
    'notion'::public.destination_kind, 'Team Notion', '{"databaseId":"db-1"}'::jsonb,
    convert_to('c', 'utf8'), convert_to('i', 'utf8'), convert_to('t', 'utf8')
  ) $$,
  'creates a destination for archive two'
);
delete from public.archives where owner_id = '22222222-2222-2222-2222-222222222222';
select is((select count(*) from public.destinations where kind = 'notion'), 0::bigint, 'deleting the archive cascades to its destinations');

-- Recreate a destination on archive one so the RLS checks below observe hidden, not absent, rows.
select lives_ok(
  $$ select public.create_destination(
    '11111111-1111-1111-1111-111111111111',
    (select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'),
    'notion'::public.destination_kind, 'My Notion', '{"databaseId":"db-2"}'::jsonb,
    convert_to('c', 'utf8'), convert_to('i', 'utf8'), convert_to('t', 'utf8')
  ) $$,
  'recreates a destination for the RLS checks'
);

select set_config('test.archive_id', (select id::text from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'), false);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select throws_ok($$ select * from public.destinations $$, '42501', null, 'grants hide all destination rows, even from the owner');

select throws_ok(
  $$ insert into public.destinations (archive_id, kind, display_name)
     values ((select id from public.archives where owner_id = '11111111-1111-1111-1111-111111111111'), 'notion', 'x') $$,
  '42501',
  'permission denied for table destinations',
  'grants block a direct insert into destinations'
);

select throws_ok(
  $$ select public.create_destination(
    '11111111-1111-1111-1111-111111111111',
    current_setting('test.archive_id')::uuid,
    'obsidian_git'::public.destination_kind, 'x', '{}'::jsonb, null, null, null
  ) $$,
  '42501',
  'permission denied for function create_destination',
  'authenticated clients cannot invoke create_destination directly'
);
select throws_ok(
  $$ select public.disconnect_destination(
    '11111111-1111-1111-1111-111111111111',
    current_setting('test.archive_id')::uuid,
    'notion'::public.destination_kind
  ) $$,
  '42501',
  'permission denied for function disconnect_destination',
  'authenticated clients cannot invoke disconnect_destination directly'
);

select * from finish();
rollback;
