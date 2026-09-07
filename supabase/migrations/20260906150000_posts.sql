-- Migration C of Phase 2 (docs/profile-page-plan.md, Finding 01).
--
-- Give posts a server-readable home. Until now SocialPost lived only inside
-- ArchiveData, serialised whole into archive_revisions.snapshot under owner-only
-- RLS and authored entirely client-side. There was no posts table and no
-- publish boundary for one — which is why the Posts tab could not ship in
-- Phase 1.
--
-- A post is one sourced clip: a URL with optional commentary, the link always
-- attached. The table therefore mirrors collection_publication_items field for
-- field (20260904140000_collection_publications.sql), plus an author, a
-- visibility tier and timestamps.
--
-- Depends on public.visibility from 20260906140000_visibility_type_swap.sql.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  item_local_id text not null check (char_length(item_local_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 500),
  url text not null check (url ~ '^https?://'),
  source_name text not null default '' check (char_length(source_name) <= 200),
  author text not null default '' check (char_length(author) <= 200),
  excerpt text not null default '' check (char_length(excerpt) <= 2000),
  commentary text not null default '' check (char_length(commentary) <= 4000),
  -- Private by default. Coeus is private by default, and a post row that exists
  -- before its author has chosen a tier must never be visible to anyone else.
  visibility public.visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, item_local_id)
);

create index posts_author_live_idx on public.posts (author_id, created_at desc);

comment on table public.posts is
  'One sourced clip published from an archive item. Writes go through publish_post / unpublish_post only; direct DML is denied to every non-service role.';
comment on column public.posts.visibility is
  'Object visibility tier. RLS below cuts at unlisted/public as defense-in-depth; the followers tier is enforced by canSee() in src/lib/visibility.ts on the read path, which always goes through the admin client.';

alter table public.posts enable row level security;

-- The followers tier cannot be expressed here without a subquery against
-- profile_follows, and every read already goes through the admin client and
-- canSee(). So the RLS select policy stays at the unlisted/public level as
-- defense-in-depth and lets canSee do the real work — the same division of
-- labour getBySlug() and collection_publications already document.
create policy "anyone reads unlisted or public posts" on public.posts for select
  using (visibility in ('unlisted', 'public'));
create policy "authors read their own posts" on public.posts for select
  using (author_id = (select auth.uid()));

-- No insert / update / delete policies: writes are service-role only, applied
-- by the security-definer functions below (mirrors publish_collection).

create or replace function public.publish_post(
  p_owner_id uuid,
  p_item_local_id text,
  p_visibility public.visibility,
  p_title text,
  p_url text,
  p_source_name text,
  p_author text,
  p_excerpt text,
  p_commentary text
)
returns table (
  post_id uuid,
  item_local_id text,
  visibility public.visibility,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid;
begin
  -- Owner guard, the publish_collection analog: the author_id is p_owner_id
  -- itself, so refuse to write a post for an id with no profile behind it.
  if not exists (select 1 from public.profiles where profiles.id = p_owner_id) then
    raise exception 'Profile not found for owner';
  end if;

  select posts.id into v_post_id
  from public.posts
  where posts.author_id = p_owner_id
    and posts.item_local_id = p_item_local_id;

  if v_post_id is null then
    insert into public.posts (
      author_id, item_local_id, title, url, source_name, author, excerpt, commentary, visibility
    ) values (
      p_owner_id, p_item_local_id, p_title, p_url,
      coalesce(p_source_name, ''), coalesce(p_author, ''),
      coalesce(p_excerpt, ''), coalesce(p_commentary, ''), p_visibility
    )
    returning id into v_post_id;
  else
    -- A republish of the same (author_id, item_local_id) updates in place.
    update public.posts set
      title = p_title,
      url = p_url,
      source_name = coalesce(p_source_name, ''),
      author = coalesce(p_author, ''),
      excerpt = coalesce(p_excerpt, ''),
      commentary = coalesce(p_commentary, ''),
      visibility = p_visibility,
      updated_at = now()
    where posts.id = v_post_id;
  end if;

  return query
  select posts.id, posts.item_local_id, posts.visibility, posts.created_at, posts.updated_at
  from public.posts
  where posts.id = v_post_id;
end;
$$;

create or replace function public.unpublish_post(
  p_owner_id uuid,
  p_item_local_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row_count integer;
begin
  if not exists (select 1 from public.profiles where profiles.id = p_owner_id) then
    raise exception 'Profile not found for owner';
  end if;

  delete from public.posts
  where posts.author_id = p_owner_id
    and posts.item_local_id = p_item_local_id;
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

revoke all on function public.publish_post(uuid, text, public.visibility, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.unpublish_post(uuid, text) from public, anon, authenticated;
grant execute on function public.publish_post(uuid, text, public.visibility, text, text, text, text, text, text) to service_role;
grant execute on function public.unpublish_post(uuid, text) to service_role;
