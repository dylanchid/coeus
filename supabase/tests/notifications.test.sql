begin;

select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test', '', now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'actor@example.test', '', now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.test', '', now()),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new@example.test', '', now());

insert into public.profiles (id, handle, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'owner', 'Owner'),
  ('22222222-2222-2222-2222-222222222222', 'actor', 'Actor'),
  ('33333333-3333-3333-3333-333333333333', 'other', 'Other');

insert into public.posts (
  id, author_id, item_local_id, title, url, visibility
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'post-1', 'A post', 'https://example.com/post-1', 'public'
);

-- ── shape ────────────────────────────────────────────────────────────────────
select has_type('public', 'notification_kind', 'the notification kind enum exists');
select has_table('public', 'notifications', 'the notifications table exists');
select has_index('public', 'notifications', 'notifications_recipient_live_idx', 'the recipient timeline index exists');
select has_index('public', 'notifications', 'notifications_recipient_unread_idx', 'the recipient unread index exists');
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
   from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'notification_kind'),
  array['follow', 'like', 'reply', 'repost'],
  'notification_kind has exactly the four product events'
);

-- ── event capture ────────────────────────────────────────────────────────────
insert into public.profile_follows (follower_id, followee_id)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
select is(
  (select count(*) from public.notifications where recipient_id = '11111111-1111-1111-1111-111111111111'),
  1::bigint,
  'a new profile follow creates one notification for the followee'
);
select is(
  (select kind::text from public.notifications where recipient_id = '11111111-1111-1111-1111-111111111111'),
  'follow',
  'the follow notification has the follow kind'
);
select is(
  (select actor_id from public.notifications where recipient_id = '11111111-1111-1111-1111-111111111111'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'the follow notification names its actor'
);

-- The source edge is idempotent, so its trigger must not duplicate the event.
insert into public.profile_follows (follower_id, followee_id)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;
select is(
  (select count(*) from public.notifications where kind = 'follow'),
  1::bigint,
  'an idempotent duplicate follow creates no second notification'
);

select public.like_target(
  '22222222-2222-2222-2222-222222222222', 'post', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
select is(
  (select count(*) from public.notifications where kind = 'like'),
  1::bigint,
  'a new like creates one notification'
);

select public.repost_target(
  '22222222-2222-2222-2222-222222222222', 'post', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
select is(
  (select count(*) from public.notifications where kind = 'repost'),
  1::bigint,
  'a new repost creates one notification'
);

create temp table top_reply as
select reply_id
from public.create_reply(
  '22222222-2222-2222-2222-222222222222', 'post', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'A useful reply'
);
select is(
  (select count(*) from public.notifications where kind = 'reply'),
  1::bigint,
  'a top-level reply creates one notification for the target owner'
);
select is(
  (select reply_id from public.notifications where kind = 'reply'),
  (select reply_id from top_reply),
  'the reply notification keeps the source reply id'
);

-- A reply to another actor notifies both the target owner and the parent author.
select public.create_reply(
  '33333333-3333-3333-3333-333333333333', 'post', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  (select reply_id from top_reply), 'A response'
);
select is(
  (select count(*) from public.notifications where kind = 'reply'),
  3::bigint,
  'a threaded reply notifies the target owner and parent author'
);
select is(
  (select count(*) from public.notifications
   where kind = 'reply' and recipient_id = '22222222-2222-2222-2222-222222222222'),
  1::bigint,
  'the parent author receives the threaded reply notification'
);

-- The target owner authored this event, so it must not notify itself.
select public.like_target(
  '11111111-1111-1111-1111-111111111111', 'post', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
select public.create_reply(
  '11111111-1111-1111-1111-111111111111', 'post', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Own reply'
);
select is(
  (select count(*) from public.notifications where recipient_id = '11111111-1111-1111-1111-111111111111'),
  5::bigint,
  'likes and replies by the target owner do not create self-notifications'
);

-- A pre-onboarding follower is valid in profile_follows and keeps an event,
-- but has no actor profile to attach.
insert into public.profile_follows (follower_id, followee_id)
values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111');
select is(
  -- Not "latest by created_at": every row in this transaction shares one now().
  (select count(*) from public.notifications where kind = 'follow' and actor_id is null),
  1::bigint,
  'a pre-onboarding follow stores a null actor profile'
);

-- ── invariants / access ──────────────────────────────────────────────────────
select is(
  (select count(*) from public.notifications where read_at is null),
  7::bigint,
  'new notifications are unread by default'
);
update public.notifications
set read_at = now()
where recipient_id = '11111111-1111-1111-1111-111111111111'
  and kind = 'follow'
  and actor_id = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*) from public.notifications where recipient_id = '11111111-1111-1111-1111-111111111111' and read_at is not null),
  1::bigint,
  'notifications support a read timestamp'
);

select is(
  (select array_agg(policyname::text order by policyname)
   from pg_policies where schemaname = 'public' and tablename = 'notifications'),
  null::text[],
  'notifications expose no direct RLS policy; reads stay behind the BFF'
);
select is(
  has_table_privilege('authenticated', 'public.notifications', 'SELECT'),
  false,
  'authenticated clients cannot read notifications directly'
);
select is(
  has_table_privilege('anon', 'public.notifications', 'INSERT'),
  false,
  'anonymous clients cannot write notifications directly'
);

select * from finish();
rollback;
