begin;

select plan(46);

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test',    '', now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actor@example.test',    '', now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@example.test', '', now());

insert into public.profiles (id, handle, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'owner',    'Owner'),
  ('22222222-2222-2222-2222-222222222222', 'actor',    'Actor'),
  ('33333333-3333-3333-3333-333333333333', 'stranger', 'Stranger');

insert into public.archives (id, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111');

-- a public collection and a followers-only post, both owned by `owner`.
select public.publish_collection(
  '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'col-1', 'my-collection',
  'public'::public.visibility, 'My Collection', '', '', '', '[]'::jsonb
);
select public.publish_post(
  '11111111-1111-1111-1111-111111111111', 'post-1', 'followers'::public.visibility,
  'My Post', 'https://example.com/p1', '', '', '', ''
);

-- ── shape ───────────────────────────────────────────────────────────────────
select has_table('public', 'likes', 'the likes table exists');
select has_table('public', 'reposts', 'the reposts table exists');
select has_table('public', 'replies', 'the replies table exists');
select has_index('public', 'likes', 'likes_actor_live_idx', 'likes (actor_id, created_at desc) exists');
select has_index('public', 'likes', 'likes_target_idx', 'likes (target_type, target_id, created_at desc) exists');
select has_index('public', 'reposts', 'reposts_actor_live_idx', 'reposts (actor_id, created_at desc) exists');
select has_index('public', 'replies', 'replies_parent_idx', 'replies (parent_id) exists');
select has_type('public', 'target_type', 'the target_type enum exists');
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'target_type'),
  array['collection', 'post'],
  'target_type has exactly collection and post'
);

-- reposts carries NO note / body column — the product decision, enforced by absence.
select hasnt_column('public', 'reposts', 'note', 'reposts has no note column');
select hasnt_column('public', 'reposts', 'body', 'reposts has no body column');
select hasnt_column('public', 'reposts', 'visibility', 'reposts has no per-row visibility column');
select hasnt_column('public', 'likes', 'visibility', 'likes has no per-row visibility column');

-- ── target ids for the tests ────────────────────────────────────────────────
-- captured into a temp table so the rest of the file can reference them.
create temp table tgt as
  select
    (select id from public.collection_publications where slug = 'my-collection') as col_id,
    (select id from public.posts where item_local_id = 'post-1') as post_id;

-- ── policy set ──────────────────────────────────────────────────────────────
select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'likes'),
  array['anyone reads likes'],
  'likes carries exactly its one permissive select policy'
);
select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'replies'),
  array['anyone reads unlisted or public replies', 'authors read their own replies'],
  'replies carries exactly the posts policy pair'
);

-- ── target_exists trigger (layer 1 of the polymorphic trade) ────────────────
select throws_ok(
  $$ insert into public.likes (actor_id, target_type, target_id)
     values ('22222222-2222-2222-2222-222222222222', 'collection', '00000000-0000-0000-0000-0000000000ff') $$,
  '23503', null, 'liking a collection that does not exist is rejected by the trigger'
);
select throws_ok(
  $$ insert into public.reposts (actor_id, target_type, target_id)
     values ('22222222-2222-2222-2222-222222222222', 'post', '00000000-0000-0000-0000-0000000000ff') $$,
  '23503', null, 'reposting a post that does not exist is rejected by the trigger'
);
select throws_ok(
  $$ insert into public.replies (author_id, target_type, target_id, body)
     values ('22222222-2222-2222-2222-222222222222', 'collection', '00000000-0000-0000-0000-0000000000ff', 'hi') $$,
  '23503', null, 'replying to a target that does not exist is rejected by the trigger'
);

-- ── like_target: idempotent ────────────────────────────────────────────────
select is(
  (select public.like_target('22222222-2222-2222-2222-222222222222', 'collection', (select col_id from tgt))),
  true, 'the first like_target reports a new like'
);
select is(
  (select public.like_target('22222222-2222-2222-2222-222222222222', 'collection', (select col_id from tgt))),
  false, 'a second like_target of the same target is idempotent, reports no new row'
);
select is(
  (select count(*) from public.likes where actor_id = '22222222-2222-2222-2222-222222222222'),
  1::bigint, 'still exactly one like row'
);
select is(
  (select public.unlike_target('22222222-2222-2222-2222-222222222222', 'collection', (select col_id from tgt))),
  true, 'unlike_target removes the like'
);
select is(
  (select public.unlike_target('22222222-2222-2222-2222-222222222222', 'collection', (select col_id from tgt))),
  false, 'a second unlike_target is a no-op'
);
select throws_ok(
  $$ select public.like_target('44444444-4444-4444-4444-444444444444', 'collection',
       (select col_id from tgt)) $$,
  'P0001', 'Profile not found for actor',
  'like_target refuses an actor id with no profile'
);

-- ── repost_target: the unique constraint rejects a raw double insert ────────
insert into public.reposts (actor_id, target_type, target_id)
values ('22222222-2222-2222-2222-222222222222', 'post', (select post_id from tgt));
select throws_ok(
  $$ insert into public.reposts (actor_id, target_type, target_id)
     values ('22222222-2222-2222-2222-222222222222', 'post', (select post_id from tgt)) $$,
  '23505', null, 'a duplicate repost violates the unique constraint'
);
select is(
  (select created from public.repost_target('22222222-2222-2222-2222-222222222222', 'post', (select post_id from tgt))),
  false, 'repost_target on an already-reposted target is idempotent (created = false)'
);
select is(
  (select created from public.repost_target('33333333-3333-3333-3333-333333333333', 'post', (select post_id from tgt))),
  true, 'repost_target for a fresh actor creates the row (created = true)'
);

-- ── create_reply: inherits the target's visibility ─────────────────────────
select is(
  (select visibility::text from public.create_reply(
     '22222222-2222-2222-2222-222222222222', 'post', (select post_id from tgt), null, 'nice post')),
  'followers', 'a reply to a followers-only post is itself followers-only, not public'
);
select is(
  (select visibility::text from public.create_reply(
     '22222222-2222-2222-2222-222222222222', 'collection', (select col_id from tgt), null, 'nice collection')),
  'public', 'a reply to a public collection is public'
);

-- ── create_reply: a parent must be on the same target ─────────────────────
create temp table r as
  select id as post_reply_id
  from public.replies
  where target_type = 'post' and author_id = '22222222-2222-2222-2222-222222222222'
  limit 1;
select throws_ok(
  format(
    $$ select public.create_reply(
         '33333333-3333-3333-3333-333333333333', 'collection', %L, %L, 'wrong target') $$,
    (select col_id from tgt), (select post_reply_id from r)
  ),
  'P0001', 'Parent reply is on a different target',
  'create_reply rejects a parent that lives on another target'
);

-- ── deleting a reply cascades to its children ──────────────────────────────
select public.create_reply(
  '33333333-3333-3333-3333-333333333333', 'post', (select post_id from tgt),
  (select post_reply_id from r), 'a child reply'
);
select is(
  (select count(*) from public.replies where parent_id = (select post_reply_id from r)),
  1::bigint, 'the child reply is attached to its parent'
);
select is(
  (select public.delete_reply('22222222-2222-2222-2222-222222222222', (select post_reply_id from r))),
  true, 'delete_reply removes the parent'
);
select is(
  (select count(*) from public.replies where parent_id = (select post_reply_id from r)),
  0::bigint, 'deleting a reply cascades to its direct children'
);

-- ── update_reply / delete_reply are author-scoped ─────────────────────────
create temp table r2 as
  select id as reply_id from public.replies
  where target_type = 'collection' and author_id = '22222222-2222-2222-2222-222222222222' limit 1;
select throws_ok(
  format($$ select public.update_reply('33333333-3333-3333-3333-333333333333', %L, 'hijacked') $$,
    (select reply_id from r2)),
  'P0001', 'Reply not found for author',
  'update_reply refuses to edit a reply the actor did not write'
);
select is(
  (select public.delete_reply('33333333-3333-3333-3333-333333333333', (select reply_id from r2))),
  false, 'delete_reply is a no-op for a non-author'
);

-- ── RLS: replies cut at unlisted/public; a stranger cannot read the ────────
--    followers-tier reply, the author can. (The cascade test above deleted the
--    first post reply, so mint a fresh followers-tier one here.)
select public.create_reply(
  '22222222-2222-2222-2222-222222222222', 'post', (select post_id from tgt), null, 'second look'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select is(
  (select count(*) from public.replies where target_type = 'post'),
  0::bigint, 'a stranger reads no followers-tier reply on the post through RLS'
);
select is(
  (select count(*) from public.replies where target_type = 'collection'),
  1::bigint, 'a stranger reads the public-collection reply through RLS'
);
select is(
  (select count(*) from public.likes),
  0::bigint, 'no likes remain to read'
);
select is(
  (select count(*) from public.reposts) > 0,
  true, 'a stranger reads repost rows through the permissive policy'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is(
  (select count(*) from public.replies where target_type = 'post' and author_id = '22222222-2222-2222-2222-222222222222'),
  1::bigint, 'the author reads their own followers-tier reply through RLS'
);
select throws_ok(
  $$ insert into public.replies (author_id, target_type, target_id, body)
     values ('22222222-2222-2222-2222-222222222222', 'collection',
       (select col_id from tgt), 'direct write') $$,
  '42501', null, 'even the author cannot INSERT a reply directly — writes go through create_reply'
);
reset role;

-- ── grant set on the RPCs ─────────────────────────────────────────────────
select is(
  has_function_privilege('service_role', 'public.like_target(uuid,public.target_type,uuid)', 'EXECUTE'),
  true, 'service_role can execute like_target'
);
select is(
  has_function_privilege('authenticated', 'public.like_target(uuid,public.target_type,uuid)', 'EXECUTE'),
  false, 'authenticated cannot execute like_target'
);
select is(
  has_function_privilege('anon', 'public.create_reply(uuid,public.target_type,uuid,uuid,text)', 'EXECUTE'),
  false, 'anon cannot execute create_reply'
);

-- ── sweep_conversation_orphans (layer 2 of the trade) ─────────────────────
-- like + repost + reply the collection, then hard-delete the collection and
-- confirm the sweep removes all three.
select public.like_target('33333333-3333-3333-3333-333333333333', 'collection', (select col_id from tgt));
select public.repost_target('33333333-3333-3333-3333-333333333333', 'collection', (select col_id from tgt));
delete from public.collection_publications where id = (select col_id from tgt);
select is(
  (select likes_removed + reposts_removed + replies_removed from public.sweep_conversation_orphans()),
  3, 'the sweep removes the orphaned like, repost and reply left by the deleted collection'
);
select is(
  (select likes_removed + reposts_removed + replies_removed from public.sweep_conversation_orphans()),
  0, 'a second sweep finds nothing — it is idempotent'
);

select * from finish();
rollback;
