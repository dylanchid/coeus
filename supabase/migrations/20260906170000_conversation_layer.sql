-- Phase 3 of docs/profile-page-plan.md §7 — the conversation layer.
--
-- Three tables that all point at OTHER people's objects: likes, reposts and
-- replies. The hard problem here is indirect visibility, not schema — see
-- canSeeIndirect() in src/lib/visibility.ts (task nfq.3.2) and the orphan
-- sweep wired into the daily cron below.
--
-- Depends on:
--   public.visibility            (20260906140000_visibility_type_swap.sql)
--   public.profiles              (20260905132000_profiles.sql)
--   public.posts                 (20260906150000_posts.sql)
--   public.collection_publications + owner_id (20260906120000_profile_surface.sql)

-- ---------------------------------------------------------------------------
-- A. target_type — the small enum over the things that can be liked / reposted
--    / replied to. Two members today; a third is an `alter type ... add value`,
--    never a new table.
-- ---------------------------------------------------------------------------
create type public.target_type as enum ('collection', 'post');

comment on type public.target_type is
  'What a like / repost / reply points at. `collection` -> collection_publications.id, `post` -> posts.id. The pair (target_type, target_id) is polymorphic and cannot be a foreign key — see the target_exists trigger and sweep_conversation_orphans() below.';

-- ---------------------------------------------------------------------------
-- THE POLYMORPHIC TRADE (Risk R6)
--
-- (target_type, target_id) cannot be a foreign key: it addresses two different
-- tables depending on target_type, and Postgres will not enforce that. The
-- alternative — a likes/reposts/replies table per target type — triples the
-- surface for a system with exactly two target types today.
--
-- Mitigation, in three layers, none of which is load-bearing alone:
--   1. conversation_target_exists() trigger on INSERT — rejects a row whose
--      target does not exist right now.
--   2. sweep_conversation_orphans() on the existing daily cron
--      (/api/archive/destinations/worker, see vercel.json) — deletes rows whose
--      target was removed after insert.
--   3. canSeeIndirect() at read time — drops orphaned rows regardless, so a
--      lagging sweep is a hygiene problem and never a visibility leak.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- B. likes — a lightweight endorsement. Not tagged per row: the whole list is
--    governed together by profiles.likes_visibility (20260906160000).
-- ---------------------------------------------------------------------------
create table public.likes (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_type public.target_type not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, target_type, target_id)
);

-- "@handle's likes, newest first" for the sidebar strip and the Likes tab.
create index likes_actor_live_idx on public.likes (actor_id, created_at desc);
-- "who liked this target" — the like count on a collection / post page.
create index likes_target_idx on public.likes (target_type, target_id, created_at desc);

comment on table public.likes is
  'A lightweight endorsement of a collection or post. No per-row visibility — the whole list is governed by profiles.likes_visibility and canSee(); each row is additionally re-checked against its target by canSeeIndirect(). Writes go through like_target / unlike_target only.';

-- ---------------------------------------------------------------------------
-- C. reposts — pure amplification. NO note or body column: a repost with a
--    note is a reply. Leaving the column out is what enforces that.
-- ---------------------------------------------------------------------------
create table public.reposts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_type public.target_type not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (actor_id, target_type, target_id)
);

create index reposts_actor_live_idx on public.reposts (actor_id, created_at desc);
create index reposts_target_idx on public.reposts (target_type, target_id, created_at desc);

comment on table public.reposts is
  'Pure amplification of a collection or post — carries no note (a repost with a note is a reply). Stores NO denormalised copy of the target title or url: the read path must join the live target so canSeeIndirect() can re-check it. Writes go through repost_target / unrepost_target only.';

-- ---------------------------------------------------------------------------
-- D. replies — a repost with a note, threaded. parent_id gives Coeus a comment
--    layer on collections and posts without a separate feature. Depth is a
--    rendering decision (two levels), never a migration.
-- ---------------------------------------------------------------------------
create table public.replies (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  target_type public.target_type not null,
  target_id uuid not null,
  parent_id uuid references public.replies(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  -- Defaults to the TARGET's visibility in create_reply(), not to public:
  -- replying to a followers-only post must not mint a public row that leaks the
  -- post exists. The column default is only a floor for a hand-written row.
  visibility public.visibility not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index replies_author_live_idx on public.replies (author_id, created_at desc);
create index replies_target_idx on public.replies (target_type, target_id, created_at desc);
-- The second level of the thread: a parent's direct responses.
create index replies_parent_idx on public.replies (parent_id) where parent_id is not null;

comment on table public.replies is
  'A threaded note on a collection or post. parent_id nests to any depth in the data; the UI renders two levels and flattens the rest. visibility is inherited from the target by create_reply(). Writes go through create_reply / update_reply / delete_reply only.';

-- ---------------------------------------------------------------------------
-- E. conversation_target_exists() — the INSERT trigger. Layer 1 of the trade.
-- ---------------------------------------------------------------------------
create or replace function public.conversation_target_exists()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_type = 'collection' then
    if not exists (
      select 1 from public.collection_publications where id = new.target_id
    ) then
      raise exception 'Target collection % does not exist', new.target_id
        using errcode = '23503';
    end if;
  elsif new.target_type = 'post' then
    if not exists (select 1 from public.posts where id = new.target_id) then
      raise exception 'Target post % does not exist', new.target_id
        using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.conversation_target_exists() is
  'BEFORE INSERT guard for likes / reposts / replies: rejects a row whose polymorphic (target_type, target_id) names no live row. Raises 23503 (foreign_key_violation) so callers treat it like the FK it cannot be.';

create trigger likes_target_exists before insert on public.likes
  for each row execute function public.conversation_target_exists();
create trigger reposts_target_exists before insert on public.reposts
  for each row execute function public.conversation_target_exists();
create trigger replies_target_exists before insert on public.replies
  for each row execute function public.conversation_target_exists();

-- ---------------------------------------------------------------------------
-- F. RLS — follows posts (20260906150000). The unlisted/public cut is
--    defense-in-depth; the followers/private gate and the indirect target
--    re-check are canSee() / canSeeIndirect() on the read path, which always
--    goes through the admin client.
-- ---------------------------------------------------------------------------
alter table public.likes enable row level security;
alter table public.reposts enable row level security;
alter table public.replies enable row level security;

-- likes and reposts carry no per-row visibility, so — like profile_follows —
-- the rows themselves are readable by anyone; the list-level gate for likes is
-- profiles.likes_visibility, applied in the view layer.
create policy "anyone reads likes" on public.likes for select using (true);
create policy "anyone reads reposts" on public.reposts for select using (true);

-- replies do carry a visibility, so they get the exact posts policy pair.
create policy "anyone reads unlisted or public replies" on public.replies for select
  using (visibility in ('unlisted', 'public'));
create policy "authors read their own replies" on public.replies for select
  using (author_id = (select auth.uid()));

-- No insert / update / delete policies on any of the three: writes are
-- service-role only, applied by the security-definer RPCs below.

-- ---------------------------------------------------------------------------
-- G. Write RPCs. Each takes the actor's profile id and validates the profile
--    exists (the publish_post owner-guard analog). "Can the actor SEE the
--    target" is enforced one layer up, in the TS API handler (task nfq.3.3),
--    which resolves the viewer and runs canSee() before calling these — the
--    followers tier cannot be expressed here without duplicating the security
--    boundary that src/lib/visibility.ts owns.
-- ---------------------------------------------------------------------------

create or replace function public.require_profile(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where profiles.id = p_id) then
    raise exception 'Profile not found for actor' using errcode = 'P0001';
  end if;
end;
$$;

-- --- likes ----------------------------------------------------------------
create or replace function public.like_target(
  p_actor_id uuid,
  p_target_type public.target_type,
  p_target_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  perform public.require_profile(p_actor_id);
  insert into public.likes (actor_id, target_type, target_id)
  values (p_actor_id, p_target_type, p_target_id)
  on conflict (actor_id, target_type, target_id) do nothing;
  get diagnostics v_inserted = row_count;
  -- true = a new like; false = it was already liked. Both are success.
  return v_inserted > 0;
end;
$$;

create or replace function public.unlike_target(
  p_actor_id uuid,
  p_target_type public.target_type,
  p_target_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.likes
  where actor_id = p_actor_id
    and target_type = p_target_type
    and target_id = p_target_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- --- reposts -------------------------------------------------------------
create or replace function public.repost_target(
  p_actor_id uuid,
  p_target_type public.target_type,
  p_target_id uuid
)
returns table (repost_id uuid, created_at timestamptz, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_created_at timestamptz;
  v_created boolean := false;
begin
  perform public.require_profile(p_actor_id);

  select reposts.id, reposts.created_at into v_id, v_created_at
  from public.reposts
  where reposts.actor_id = p_actor_id
    and reposts.target_type = p_target_type
    and reposts.target_id = p_target_id;

  if v_id is null then
    insert into public.reposts (actor_id, target_type, target_id)
    values (p_actor_id, p_target_type, p_target_id)
    returning reposts.id, reposts.created_at into v_id, v_created_at;
    v_created := true;
  end if;

  return query select v_id, v_created_at, v_created;
end;
$$;

create or replace function public.unrepost_target(
  p_actor_id uuid,
  p_target_type public.target_type,
  p_target_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.reposts
  where actor_id = p_actor_id
    and target_type = p_target_type
    and target_id = p_target_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- --- replies -----------------------------------------------------------
-- Resolves the target's current visibility so a reply inherits it. Returns
-- null when the target does not exist (the trigger will also reject, but this
-- lets create_reply give a cleaner error).
create or replace function public.conversation_target_visibility(
  p_target_type public.target_type,
  p_target_id uuid
)
returns public.visibility
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visibility public.visibility;
begin
  if p_target_type = 'collection' then
    select visibility into v_visibility
    from public.collection_publications
    where id = p_target_id and unpublished_at is null;
  elsif p_target_type = 'post' then
    select visibility into v_visibility from public.posts where id = p_target_id;
  end if;
  return v_visibility;
end;
$$;

create or replace function public.create_reply(
  p_author_id uuid,
  p_target_type public.target_type,
  p_target_id uuid,
  p_parent_id uuid,
  p_body text
)
returns table (
  reply_id uuid,
  visibility public.visibility,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visibility public.visibility;
  v_parent_target_type public.target_type;
  v_parent_target_id uuid;
  v_id uuid;
  v_created_at timestamptz;
begin
  perform public.require_profile(p_author_id);

  -- A parent must be a reply on the SAME target — the thread cannot jump
  -- objects.
  if p_parent_id is not null then
    select replies.target_type, replies.target_id
      into v_parent_target_type, v_parent_target_id
    from public.replies where replies.id = p_parent_id;
    if v_parent_target_type is null then
      raise exception 'Parent reply % does not exist', p_parent_id using errcode = 'P0001';
    end if;
    if v_parent_target_type <> p_target_type or v_parent_target_id <> p_target_id then
      raise exception 'Parent reply is on a different target' using errcode = 'P0001';
    end if;
  end if;

  -- Inherit the target's visibility. Replying to a followers-only post makes a
  -- followers-only reply, never a public one.
  v_visibility := public.conversation_target_visibility(p_target_type, p_target_id);
  if v_visibility is null then
    raise exception 'Target % does not exist', p_target_id using errcode = '23503';
  end if;

  insert into public.replies (author_id, target_type, target_id, parent_id, body, visibility)
  values (p_author_id, p_target_type, p_target_id, p_parent_id, p_body, v_visibility)
  returning replies.id, replies.created_at into v_id, v_created_at;

  return query select v_id, v_visibility, v_created_at;
end;
$$;

create or replace function public.update_reply(
  p_author_id uuid,
  p_reply_id uuid,
  p_body text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row_count integer;
begin
  update public.replies set
    body = p_body,
    updated_at = now()
  where id = p_reply_id and author_id = p_author_id;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception 'Reply not found for author' using errcode = 'P0001';
  end if;
  return true;
end;
$$;

create or replace function public.delete_reply(
  p_author_id uuid,
  p_reply_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row_count integer;
begin
  -- on delete cascade on parent_id takes the children with it.
  delete from public.replies where id = p_reply_id and author_id = p_author_id;
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- H. sweep_conversation_orphans() — layer 2 of the trade. Deletes rows whose
--    polymorphic target has since been removed. Called from the daily cron
--    tick at /api/archive/destinations/worker. Idempotent; returns the count
--    removed per table for the worker's JSON response.
-- ---------------------------------------------------------------------------
create or replace function public.sweep_conversation_orphans()
returns table (likes_removed integer, reposts_removed integer, replies_removed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_likes integer;
  v_reposts integer;
  v_replies integer;
begin
  with removed as (
    delete from public.likes l
    where not exists (
      select 1 from public.collection_publications c
      where l.target_type = 'collection' and c.id = l.target_id
    ) and not exists (
      select 1 from public.posts p where l.target_type = 'post' and p.id = l.target_id
    )
    returning 1
  )
  select count(*)::integer into v_likes from removed;

  with removed as (
    delete from public.reposts r
    where not exists (
      select 1 from public.collection_publications c
      where r.target_type = 'collection' and c.id = r.target_id
    ) and not exists (
      select 1 from public.posts p where r.target_type = 'post' and p.id = r.target_id
    )
    returning 1
  )
  select count(*)::integer into v_reposts from removed;

  with removed as (
    delete from public.replies rp
    where not exists (
      select 1 from public.collection_publications c
      where rp.target_type = 'collection' and c.id = rp.target_id
    ) and not exists (
      select 1 from public.posts p where rp.target_type = 'post' and p.id = rp.target_id
    )
    returning 1
  )
  select count(*)::integer into v_replies from removed;

  return query select v_likes, v_reposts, v_replies;
end;
$$;

comment on function public.sweep_conversation_orphans() is
  'Layer 2 of the polymorphic trade (Risk R6): deletes likes / reposts / replies whose (target_type, target_id) no longer resolves. Run daily from the destinations worker cron. canSeeIndirect() already hides these at read time, so a missed run never leaks.';

-- ---------------------------------------------------------------------------
-- I. Grants. Every RPC is service_role only — the same lockdown publish_post
--    and publish_collection use.
-- ---------------------------------------------------------------------------
revoke all on function public.require_profile(uuid) from public, anon, authenticated;
revoke all on function public.like_target(uuid, public.target_type, uuid) from public, anon, authenticated;
revoke all on function public.unlike_target(uuid, public.target_type, uuid) from public, anon, authenticated;
revoke all on function public.repost_target(uuid, public.target_type, uuid) from public, anon, authenticated;
revoke all on function public.unrepost_target(uuid, public.target_type, uuid) from public, anon, authenticated;
revoke all on function public.conversation_target_visibility(public.target_type, uuid) from public, anon, authenticated;
revoke all on function public.create_reply(uuid, public.target_type, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.update_reply(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.delete_reply(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sweep_conversation_orphans() from public, anon, authenticated;

grant execute on function public.like_target(uuid, public.target_type, uuid) to service_role;
grant execute on function public.unlike_target(uuid, public.target_type, uuid) to service_role;
grant execute on function public.repost_target(uuid, public.target_type, uuid) to service_role;
grant execute on function public.unrepost_target(uuid, public.target_type, uuid) to service_role;
grant execute on function public.create_reply(uuid, public.target_type, uuid, uuid, text) to service_role;
grant execute on function public.update_reply(uuid, uuid, text) to service_role;
grant execute on function public.delete_reply(uuid, uuid) to service_role;
grant execute on function public.sweep_conversation_orphans() to service_role;
