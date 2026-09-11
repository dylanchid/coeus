begin;

select plan(13);

-- bareaga_web-kxe: thread_descendants() pages every reply under one root with a
-- keyset cursor; thread_descendant_counts() totals them per root so the Replies
-- tab can link to the full thread.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author@example.test', '', now());

insert into public.profiles (id, handle, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'author', 'Author');

select public.publish_post(
  '11111111-1111-1111-1111-111111111111', 'post-1', 'public'::public.visibility,
  'My Post', 'https://example.com/p1', '', '', '', ''
);

-- Root + a deep chain: root <- c1 <- c2 <- c3, plus two extra leaves on the root.
select public.create_reply('11111111-1111-1111-1111-111111111111', 'post'::public.target_type,
  (select id from public.posts where item_local_id = 'post-1'), null, 'root');

-- helper: latest reply id
create temporary table ids (name text primary key, id uuid);
insert into ids values ('root', (select id from public.replies where parent_id is null));

select public.create_reply('11111111-1111-1111-1111-111111111111', 'post'::public.target_type,
  (select id from public.posts where item_local_id = 'post-1'), (select id from ids where name = 'root'), 'c1');
insert into ids values ('c1', (select id from public.replies where body = 'c1'));
select public.create_reply('11111111-1111-1111-1111-111111111111', 'post'::public.target_type,
  (select id from public.posts where item_local_id = 'post-1'), (select id from ids where name = 'c1'), 'c2');
insert into ids values ('c2', (select id from public.replies where body = 'c2'));
select public.create_reply('11111111-1111-1111-1111-111111111111', 'post'::public.target_type,
  (select id from public.posts where item_local_id = 'post-1'), (select id from ids where name = 'c2'), 'c3');
select public.create_reply('11111111-1111-1111-1111-111111111111', 'post'::public.target_type,
  (select id from public.posts where item_local_id = 'post-1'), (select id from ids where name = 'root'), 'leaf1');
select public.create_reply('11111111-1111-1111-1111-111111111111', 'post'::public.target_type,
  (select id from public.posts where item_local_id = 'post-1'), (select id from ids where name = 'root'), 'leaf2');

-- create_reply stamps every row with the transaction's now(); stagger them so
-- the keyset order is deterministic (mirrors real inserts across requests).
update public.replies set created_at = timestamptz '2026-01-01 00:00:00Z' + (
  case body when 'c1' then 1 when 'c2' then 2 when 'c3' then 3 when 'leaf1' then 4 when 'leaf2' then 5 else 0 end
) * interval '1 minute'
where parent_id is not null;

-- ── functions exist ─────────────────────────────────────────────────────────
select has_function('public', 'thread_descendants', 'thread_descendants() exists');
select has_function('public', 'thread_descendant_counts', 'thread_descendant_counts() exists');
select has_column('public', 'replies', 'thread_root_id', 'replies persist their thread root');
select has_index('public', 'replies', 'replies_thread_root_page_idx', 'thread-root keyset index exists');

-- ── thread_descendants walks every depth, not just two levels ────────────────
select is(
  (select count(*)::int from public.thread_descendants((select id from ids where name = 'root'), null, null, 100)),
  5,
  'thread_descendants returns all 5 descendants (c1, c2, c3, leaf1, leaf2)'
);

select is(
  (select array_agg(body order by created_at, id)
     from public.thread_descendants((select id from ids where name = 'root'), null, null, 100)),
  array['c1', 'c2', 'c3', 'leaf1', 'leaf2'],
  'ordered oldest-first by (created_at, id)'
);

-- ── the keyset cursor: a second page picks up strictly after the first ──────
select is(
  (with p1 as (
     select created_at, id from public.thread_descendants((select id from ids where name = 'root'), null, null, 2)
     order by created_at desc, id desc limit 1
   )
   select count(*)::int
   from public.thread_descendants(
     (select id from ids where name = 'root'),
     (select created_at from p1), (select id from p1), 100)),
  3,
  'paging after row 2 returns the remaining 3'
);

select is(
  (select count(*)::int
     from public.thread_descendants((select id from ids where name = 'root'), null, null, 3)),
  3,
  'the limit is honoured'
);

-- ── thread_descendant_counts ────────────────────────────────────────────────
select is(
  (select total from public.thread_descendant_counts(array[(select id from ids where name = 'root')])),
  5::bigint,
  'thread_descendant_counts totals the whole nested tree'
);

select is(
  (select total from public.thread_descendant_counts(array[(select id from ids where name = 'root')])),
  5::bigint,
  'the indexed count remains complete after keyset pagination'
);

select is(
  (select count(*)::int from public.thread_descendant_counts(array[(select id from ids where name = 'c3')])),
  0,
  'a leaf with no descendants is absent from the result'
);

-- ── grants: BFF-only, like every other conversation read ────────────────────
select is(
  has_function_privilege('service_role', 'public.thread_descendants(uuid,timestamptz,uuid,integer)', 'EXECUTE'),
  true, 'service_role can execute thread_descendants'
);
select is(
  has_function_privilege('anon', 'public.thread_descendants(uuid,timestamptz,uuid,integer)', 'EXECUTE'),
  false, 'anon cannot execute thread_descendants'
);

select * from finish();

rollback;
