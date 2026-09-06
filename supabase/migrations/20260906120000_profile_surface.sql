-- Profile page surface (Phase 1 of docs/profile-page-plan.md).
--
-- Three concerns, one file because they are one product change — "make a
-- profile renderable at /@handle":
--   A. profiles gains the columns the page displays (avatar, cover, location,
--      links, pinned order), each constrained in the database the way handle
--      already is, so a malformed write fails at the boundary.
--   B. collection_publications gains a denormalised owner_id so "@handle's
--      collections" is one indexed query, not a three-hop join through
--      archives (owner-only RLS) on a public page's hot path — Finding 02.
--   C. a public profile-media storage bucket for uploaded avatars/covers,
--      with a per-account path-prefix write policy — Risk R3.

-- ---------------------------------------------------------------------------
-- A. profiles surface columns
-- ---------------------------------------------------------------------------

-- links is validated in the database, not only in the app: an array of at
-- most five {label, url} objects with an http(s) url. Kept as an IMMUTABLE
-- helper rather than an inline CHECK because the per-entry rules do not read
-- as one predicate.
create or replace function public.profile_links_valid(p_links jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_links) > 5 then
    return false;
  end if;
  return not exists (
    select 1
    from jsonb_array_elements(p_links) as entry
    where jsonb_typeof(entry) <> 'object'
      or coalesce(char_length(entry ->> 'label'), 0) = 0
      or char_length(entry ->> 'label') > 60
      or coalesce(entry ->> 'url', '') !~ '^https?://'
      or char_length(entry ->> 'url') > 400
  );
end;
$$;

comment on function public.profile_links_valid(jsonb) is
  'CHECK helper for profiles.links: a jsonb array of <=5 {label,url} objects, each url http(s), label 1..60 chars, url <=400 chars.';

alter table public.profiles
  add column avatar_url text,
  add column cover_url  text,
  add column location   text,
  add column links      jsonb  not null default '[]'::jsonb,
  add column pinned_collection_slugs text[] not null default '{}';

alter table public.profiles
  add constraint profiles_location_len
    check (location is null or char_length(location) <= 80),
  add constraint profiles_links_shape
    check (public.profile_links_valid(links)),
  -- An avatar/cover URL must be a Supabase public-object URL for THIS bucket,
  -- so a profile row can never point the page at an arbitrary third-party
  -- host. The upload route (task 1.9) is the real gate; this is
  -- defense-in-depth. Host-agnostic so it holds across local/preview/prod.
  add constraint profiles_avatar_url_in_bucket
    check (avatar_url is null or avatar_url ~ '^https?://[^/]+/storage/v1/object/public/profile-media/'),
  add constraint profiles_cover_url_in_bucket
    check (cover_url is null or cover_url ~ '^https?://[^/]+/storage/v1/object/public/profile-media/');

comment on column public.profiles.avatar_url is
  'Public URL of the uploaded square avatar, inside the profile-media bucket. Null renders avatarInitials().';
comment on column public.profiles.cover_url is
  'Public URL of the uploaded cover, inside the profile-media bucket. Null renders the deterministic generativeCover(handle).';
comment on column public.profiles.location is
  'Free-text location, <=80 chars. Display only.';
comment on column public.profiles.links is
  'Ordered jsonb array of <=5 {label,url} external links. Shape enforced by profile_links_valid().';
comment on column public.profiles.pinned_collection_slugs is
  'Ordered list of this owner''s published collection slugs to surface first on the profile. Slugs not currently published are ignored at render time.';

-- profiles_touch_updated_at (20260905132000_profiles.sql) already fires
-- before update for each row, so the new columns get updated_at maintenance
-- for free — no trigger change needed.

-- ---------------------------------------------------------------------------
-- B. collection_publications.owner_id — Finding 02
-- ---------------------------------------------------------------------------

alter table public.collection_publications
  add column owner_id uuid references auth.users(id) on delete cascade;

update public.collection_publications p
  set owner_id = a.owner_id
  from public.archives a
  where a.id = p.archive_id;

alter table public.collection_publications
  alter column owner_id set not null;

-- The profile page's "live collections by this owner, newest first" query.
create index collection_publications_owner_live_idx
  on public.collection_publications (owner_id, published_at desc)
  where unpublished_at is null;

comment on column public.collection_publications.owner_id is
  'Denormalised copy of archives.owner_id, set by publish_collection() on first publish and never updated. Lets the profile page list an owner''s collections without joining through the owner-only archives RLS.';

-- Recreate publish_collection() so the insert branch carries owner_id. The
-- signature is unchanged (the visibility enum is not touched until Phase 2),
-- so this is a plain CREATE OR REPLACE and existing grants stand.
create or replace function public.publish_collection(
  p_owner_id uuid,
  p_archive_id uuid,
  p_collection_local_id text,
  p_slug text,
  p_visibility public.collection_publication_visibility,
  p_name text,
  p_description text,
  p_curator_note text,
  p_attribution text,
  p_items jsonb
)
returns table (
  publication_id uuid,
  slug text,
  visibility public.collection_publication_visibility,
  published_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archive_owner uuid;
  v_publication_id uuid;
begin
  select owner_id into v_archive_owner from public.archives where id = p_archive_id;
  if v_archive_owner is null or v_archive_owner <> p_owner_id then
    raise exception 'Archive not found for owner';
  end if;

  select collection_publications.id into v_publication_id
  from public.collection_publications
  where collection_publications.archive_id = p_archive_id
    and collection_publications.collection_local_id = p_collection_local_id;

  if v_publication_id is null then
    insert into public.collection_publications (
      archive_id, collection_local_id, slug, visibility, name, description, curator_note, attribution, owner_id
    ) values (
      p_archive_id, p_collection_local_id, p_slug, p_visibility, p_name, p_description, p_curator_note, p_attribution, p_owner_id
    )
    returning id into v_publication_id;
  else
    -- p_slug is ignored on republish: the stable URL never changes once assigned.
    -- owner_id is deliberately not touched: it can never drift from the archive owner.
    update public.collection_publications set
      visibility = p_visibility,
      name = p_name,
      description = p_description,
      curator_note = p_curator_note,
      attribution = p_attribution,
      unpublished_at = null,
      updated_at = now()
    where id = v_publication_id;
  end if;

  delete from public.collection_publication_items where collection_publication_items.publication_id = v_publication_id;
  insert into public.collection_publication_items (
    publication_id, item_local_id, position, title, url, source_name, author, excerpt, curator_comment
  )
  select
    v_publication_id,
    entry ->> 'itemLocalId',
    (entry ->> 'position')::integer,
    entry ->> 'title',
    entry ->> 'url',
    coalesce(entry ->> 'sourceName', ''),
    coalesce(entry ->> 'author', ''),
    coalesce(entry ->> 'excerpt', ''),
    coalesce(entry ->> 'curatorComment', '')
  from jsonb_array_elements(p_items) as entry;

  return query
  select collection_publications.id, collection_publications.slug, collection_publications.visibility,
         collection_publications.published_at, collection_publications.updated_at
  from public.collection_publications
  where collection_publications.id = v_publication_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- C. profile-media storage bucket — Risk R3
-- ---------------------------------------------------------------------------

-- Public bucket: these images render for signed-out visitors of a profile.
-- The write policy scopes each account to its own "<uid>/" path prefix, the
-- same foldername() idiom the archive-snapshots bucket uses in
-- 20260904120000_synced_archives.sql.
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update set public = true;

create policy "anyone reads profile media" on storage.objects for select
  using (bucket_id = 'profile-media');

create policy "owners upload their own profile media" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owners replace their own profile media" on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owners delete their own profile media" on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
