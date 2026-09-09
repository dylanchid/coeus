begin;

select plan(8);

-- PostgREST runs these roles. Neither may receive raw table rows: all reads
-- and writes are deliberately served by the Next BFF with a service-role
-- client after the application has enforced visibility and ownership rules.
select is(
  (select count(*) from pg_tables
   where schemaname = 'public'
     and has_table_privilege('anon', schemaname || '.' || tablename, 'select')),
  0::bigint,
  'anon has no SELECT grant on any public application table'
);
select is(
  (select count(*) from pg_tables
   where schemaname = 'public'
     and has_table_privilege('authenticated', schemaname || '.' || tablename, 'select')),
  0::bigint,
  'authenticated has no SELECT grant on any public application table'
);
select is(
  (select count(*) from pg_tables
   where schemaname = 'public'
     and has_table_privilege('anon', schemaname || '.' || tablename, 'insert, update, delete')),
  0::bigint,
  'anon has no DML grant on any public application table'
);
select is(
  (select count(*) from pg_tables
   where schemaname = 'public'
     and has_table_privilege('authenticated', schemaname || '.' || tablename, 'insert, update, delete')),
  0::bigint,
  'authenticated has no DML grant on any public application table'
);

-- F-29: EXECUTE on public functions is revoked from the PostgREST roles, so no
-- SECURITY DEFINER helper is reachable as an RPC. service_role is unaffected.
select is(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')),
  0::bigint,
  'anon has no EXECUTE grant on any public function'
);
select is(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('authenticated', p.oid, 'execute')),
  0::bigint,
  'authenticated has no EXECUTE grant on any public function'
);
select is(
  has_function_privilege('service_role', 'public.initialize_archive(uuid, jsonb)', 'execute'),
  true,
  'service_role (the BFF) can still execute public functions'
);

set local role authenticated;
select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  'permission denied for table profiles',
  'an authenticated PostgREST caller cannot bypass the public-profile BFF view'
);

select * from finish();
rollback;
