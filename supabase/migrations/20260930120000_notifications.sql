-- In-app notifications for the profile/social event layer.
-- v1 is intentionally in-app only: no email sender or digest worker exists yet.
-- Events are created in the same transaction as their source row by triggers, so
-- a successful follow/like/reply/repost cannot lose its notification.

create type public.notification_kind as enum ('follow', 'like', 'reply', 'repost');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  -- A follower may act before onboarding, so this is nullable and the inbox
  -- renders that historical event as "Someone" until an actor profile exists.
  actor_id uuid references public.profiles(id) on delete set null,
  kind public.notification_kind not null,
  target_type public.target_type,
  target_id uuid,
  -- Replies can be deleted while the notification remains useful as history.
  reply_id uuid references public.replies(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (
    (kind = 'follow' and target_type is null and target_id is null and reply_id is null)
    or
    (kind in ('like', 'repost') and target_type is not null and target_id is not null and reply_id is null)
    or
    (kind = 'reply' and target_type is not null and target_id is not null and reply_id is not null)
  )
);

create index notifications_recipient_live_idx
  on public.notifications (recipient_id, created_at desc, id desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, read_at, created_at desc, id desc);

comment on table public.notifications is
  'Transactional in-app notifications. Rows are private to recipient_id and are read through the server-side notifications API.';
comment on column public.notifications.actor_id is
  'Profile that caused the event; nullable because profile_follows permits pre-onboarding accounts.';
comment on column public.notifications.reply_id is
  'The reply that caused a reply notification; nullable after the reply is deleted.';

alter table public.notifications enable row level security;

-- Notifications are deliberately not directly queryable or writable by client
-- roles. The authenticated server route uses the service-role client after
-- resolving the caller from its signed session.
revoke all on public.notifications from anon, authenticated;

create or replace function public.notification_target_owner(
  p_target_type public.target_type,
  p_target_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
begin
  if p_target_type = 'collection' then
    select owner_id into v_owner_id
    from public.collection_publications
    where id = p_target_id;
  elsif p_target_type = 'post' then
    select author_id into v_owner_id
    from public.posts
    where id = p_target_id;
  end if;
  return v_owner_id;
end;
$$;

comment on function public.notification_target_owner(public.target_type, uuid) is
  'Resolves the profile that owns a polymorphic conversation target for notification triggers.';

create or replace function public.insert_notification(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_kind public.notification_kind,
  p_target_type public.target_type default null,
  p_target_id uuid default null,
  p_reply_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id then
    return;
  end if;

  insert into public.notifications (
    recipient_id, actor_id, kind, target_type, target_id, reply_id
  )
  values (
    p_recipient_id, p_actor_id, p_kind, p_target_type, p_target_id, p_reply_id
  );
end;
$$;

-- A profile follow is the only event whose source actor may not have a profile.
create or replace function public.notify_profile_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.insert_notification(
    new.followee_id,
    (select id from public.profiles where id = new.follower_id),
    'follow'
  );
  return new;
end;
$$;

create trigger profile_follows_notify
  after insert on public.profile_follows
  for each row execute function public.notify_profile_follow();

create or replace function public.notify_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.insert_notification(
    public.notification_target_owner(new.target_type, new.target_id),
    new.actor_id,
    'like',
    new.target_type,
    new.target_id
  );
  return new;
end;
$$;

create trigger likes_notify
  after insert on public.likes
  for each row execute function public.notify_like();

create or replace function public.notify_repost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.insert_notification(
    public.notification_target_owner(new.target_type, new.target_id),
    new.actor_id,
    'repost',
    new.target_type,
    new.target_id
  );
  return new;
end;
$$;

create trigger reposts_notify
  after insert on public.reposts
  for each row execute function public.notify_repost();

create or replace function public.notify_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_owner_id uuid;
  v_parent_author_id uuid;
begin
  v_target_owner_id := public.notification_target_owner(new.target_type, new.target_id);
  perform public.insert_notification(
    v_target_owner_id,
    new.author_id,
    'reply',
    new.target_type,
    new.target_id,
    new.id
  );

  -- A response inside a thread also belongs in the parent author's inbox. The
  -- helper suppresses the actor's own notification, and this guard avoids two
  -- identical notifications when the parent author owns the target.
  if new.parent_id is not null then
    select author_id into v_parent_author_id
    from public.replies
    where id = new.parent_id;
    if v_parent_author_id is not null
       and v_parent_author_id <> coalesce(v_target_owner_id, '00000000-0000-0000-0000-000000000000'::uuid) then
      perform public.insert_notification(
        v_parent_author_id,
        new.author_id,
        'reply',
        new.target_type,
        new.target_id,
        new.id
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger replies_notify
  after insert on public.replies
  for each row execute function public.notify_reply();

-- Triggers are the only caller; do not expose the helper functions to clients.
revoke all on function public.notification_target_owner(public.target_type, uuid) from public, anon, authenticated;
revoke all on function public.insert_notification(uuid, uuid, public.notification_kind, public.target_type, uuid, uuid) from public, anon, authenticated;
revoke all on function public.notify_profile_follow() from public, anon, authenticated;
revoke all on function public.notify_like() from public, anon, authenticated;
revoke all on function public.notify_repost() from public, anon, authenticated;
revoke all on function public.notify_reply() from public, anon, authenticated;
