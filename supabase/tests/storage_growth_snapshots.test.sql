begin;

select plan(6);

-- Start from a known-empty table (rolled back with the rest of the test) so the
-- append assertions below are not thrown off by rows a prior real capture left.
delete from public.storage_growth_snapshots;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'growth@example.test', '', now());

select public.initialize_archive(
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '{"syncVersion":1,"revision":0,"generatedAt":"2026-09-08T00:00:00.000Z","archive":{"version":1,"items":[],"collections":[],"socialPosts":[]},"entityVersions":{}}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Lockdown: the table is service-role only.
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'storage_growth_snapshots'
     and grantee in ('anon', 'authenticated')),
  0::bigint,
  'anon and authenticated have no grant on storage_growth_snapshots'
);

select is(
  has_function_privilege('anon', 'public.capture_storage_growth()', 'execute')::text,
  'false',
  'anon cannot execute capture_storage_growth()'
);

-- ---------------------------------------------------------------------------
-- capture_storage_growth(): first call has no baseline, appends a row.
-- ---------------------------------------------------------------------------
select is(
  (select previous_at from public.capture_storage_growth()),
  null::timestamptz,
  'the first capture reports no previous reading'
);

select is(
  (select count(*) from public.storage_growth_snapshots),
  1::bigint,
  'the first capture appended one row'
);

-- ---------------------------------------------------------------------------
-- A second call sees the first as its baseline and returns real byte totals.
-- ---------------------------------------------------------------------------
select is(
  (select previous_bytes is not null from public.capture_storage_growth()),
  true,
  'the second capture reports the first as its baseline'
);

select is(
  (select count(*) from public.storage_growth_snapshots),
  2::bigint,
  'the second capture appended another row'
);

select * from finish();
rollback;
