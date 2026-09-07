begin;

select plan(5);

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

set local role authenticated;
select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  'permission denied for table profiles',
  'an authenticated PostgREST caller cannot bypass the public-profile BFF view'
);

select * from finish();
rollback;
