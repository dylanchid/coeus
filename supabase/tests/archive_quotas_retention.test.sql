begin;

select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quota@example.test', '', now());

select public.initialize_archive(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '{"syncVersion":1,"revision":0,"generatedAt":"2026-09-07T00:00:00.000Z","archive":{"version":1,"items":[],"collections":[],"socialPosts":[]},"entityVersions":{}}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Snapshot budget trigger
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.archive_revisions (archive_id, revision, parent_revision, snapshot)
     values (
       (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
       1, 0,
       jsonb_build_object('archive', jsonb_build_object('items',
         (select jsonb_agg(jsonb_build_object('id', g::text)) from generate_series(1, 5001) g)))
     ) $$,
  '23514',
  null,
  'the revision-budget trigger rejects a >5000-item snapshot'
);

select lives_ok(
  $$ insert into public.archive_revisions (archive_id, revision, parent_revision, snapshot)
     values (
       (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
       1, 0,
       jsonb_build_object('archive', jsonb_build_object('items',
         (select jsonb_agg(jsonb_build_object('id', g::text)) from generate_series(1, 10) g)))
     ) $$,
  'a small snapshot inserts fine'
);

-- ---------------------------------------------------------------------------
-- Rate limit
-- ---------------------------------------------------------------------------
select ok((select allowed from public.consume_archive_sync_budget('cccccccc-cccc-cccc-cccc-cccccccccccc', 3, 300)), 'request 1 allowed');
select ok((select allowed from public.consume_archive_sync_budget('cccccccc-cccc-cccc-cccc-cccccccccccc', 3, 300)), 'request 2 allowed');
select ok((select allowed from public.consume_archive_sync_budget('cccccccc-cccc-cccc-cccc-cccccccccccc', 3, 300)), 'request 3 allowed');
select ok((select not allowed from public.consume_archive_sync_budget('cccccccc-cccc-cccc-cccc-cccccccccccc', 3, 300)), 'request 4 is rate-limited');
select ok((select retry_after_seconds > 0 from public.consume_archive_sync_budget('cccccccc-cccc-cccc-cccc-cccccccccccc', 3, 300)), 'a rate-limited response carries a positive retry-after');
select ok((select not allowed from public.consume_archive_sync_budget('cccccccc-cccc-cccc-cccc-cccccccccccc', 3, 300)), 'still limited within the window');

-- ---------------------------------------------------------------------------
-- Revision retention
-- ---------------------------------------------------------------------------
insert into public.archive_revisions (archive_id, revision, parent_revision, snapshot)
select (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
       g, g - 1, '{"archive":{"items":[]}}'::jsonb
from generate_series(2, 5) g;

update public.archives set current_revision = 5
where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

update public.archive_revisions set created_at = now() - interval '60 days'
where archive_id = (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')
  and revision <= 2;

select is(
  public.prune_archive_revisions(
    (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 2, 30),
  4,
  'prune removes revisions outside the recent-2 count window even when they are new'
);
select is(
  (select count(*) from public.archive_revisions
   where archive_id = (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')),
  2::bigint,
  'the two newest revisions are retained'
);
select is(
  (select count(*) from public.archive_revisions
   where archive_id = (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')
     and revision = 5),
  1::bigint,
  'the current revision is never pruned'
);

update public.archive_revisions set created_at = now() - interval '60 days'
where archive_id = (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')
  and revision = 4;

select is(
  public.prune_archive_revisions(
    (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 2, 30),
  1,
  'prune removes an old revision even inside the count window'
);
select is(
  (select count(*) from public.archive_revisions
   where archive_id = (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')),
  1::bigint,
  'only the current revision remains after the age cap applies'
);

-- ---------------------------------------------------------------------------
-- Storage stats
-- ---------------------------------------------------------------------------
select is(
  (select revision_count from public.archive_storage_stats()
   where archive_id = (select id from public.archives where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')),
  1::bigint,
  'archive_storage_stats reports the live revision count'
);

select * from finish();
rollback;
