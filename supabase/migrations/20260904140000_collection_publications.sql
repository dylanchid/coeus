-- Public-facing collection publications.
-- Deliberately normalized and separate from archives/archive_revisions: a
-- publication only ever contains the fields an owner explicitly chose to
-- publish (see derivePublicationSnapshot in src/lib/collectionPublication.ts),
-- never the private archive item (note, tags, state, starred, topic).
create type public.collection_publication_visibility as enum ('unlisted', 'public');

create table public.collection_publications (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  collection_local_id text not null check (char_length(collection_local_id) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 96),
  visibility public.collection_publication_visibility not null default 'unlisted',
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  curator_note text not null default '' check (char_length(curator_note) <= 4000),
  attribution text not null default '' check (char_length(attribution) <= 4000),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unpublished_at timestamptz,
  unique (archive_id, collection_local_id)
);

create table public.collection_publication_items (
  publication_id uuid not null references public.collection_publications(id) on delete cascade,
  item_local_id text not null check (char_length(item_local_id) between 1 and 160),
  position integer not null check (position >= 0),
  title text not null check (char_length(title) between 1 and 500),
  url text not null check (url ~ '^https?://'),
  source_name text not null default '' check (char_length(source_name) <= 200),
  author text not null default '' check (char_length(author) <= 200),
  excerpt text not null default '' check (char_length(excerpt) <= 2000),
  curator_comment text not null default '' check (char_length(curator_comment) <= 4000),
  primary key (publication_id, item_local_id)
);

create index collection_publications_archive_idx
  on public.collection_publications (archive_id);
create index collection_publications_live_idx
  on public.collection_publications (visibility, published_at desc)
  where unpublished_at is null;
create index collection_publication_items_order_idx
  on public.collection_publication_items (publication_id, position);

alter table public.collection_publications enable row level security;
alter table public.collection_publication_items enable row level security;

create policy "anyone reads live publications" on public.collection_publications for select
  using (unpublished_at is null and visibility in ('public', 'unlisted'));
create policy "owners read their own publications" on public.collection_publications for select
  using (exists (select 1 from public.archives where archives.id = archive_id and archives.owner_id = (select auth.uid())));

create policy "anyone reads items of live publications" on public.collection_publication_items for select
  using (exists (
    select 1 from public.collection_publications
    where collection_publications.id = publication_id
      and collection_publications.unpublished_at is null
      and collection_publications.visibility in ('public', 'unlisted')
  ));
create policy "owners read their own publication items" on public.collection_publication_items for select
  using (exists (
    select 1 from public.collection_publications
    join public.archives on archives.id = collection_publications.archive_id
    where collection_publications.id = publication_id
      and archives.owner_id = (select auth.uid())
  ));

-- Writes are service-role only, applied transactionally by the functions
-- below (mirrors initialize_archive/commit_archive_sync in
-- 20260904120000_synced_archives.sql). "unlisted" collections stay readable
-- by direct slug link under the same select policy; discovery listings
-- additionally filter to visibility = 'public' at the query level.
comment on table public.collection_publications is
  'Explicitly published, public-safe snapshot of a private archive collection. Slug is assigned once and stable across republishes.';
comment on column public.collection_publications.slug is
  'Stable public URL segment. Never reassigned by publish_collection once a publication row exists.';

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
      archive_id, collection_local_id, slug, visibility, name, description, curator_note, attribution
    ) values (
      p_archive_id, p_collection_local_id, p_slug, p_visibility, p_name, p_description, p_curator_note, p_attribution
    )
    returning id into v_publication_id;
  else
    -- p_slug is ignored on republish: the stable URL never changes once assigned.
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

create or replace function public.unpublish_collection(
  p_owner_id uuid,
  p_archive_id uuid,
  p_collection_local_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archive_owner uuid;
  v_row_count integer;
begin
  select owner_id into v_archive_owner from public.archives where id = p_archive_id;
  if v_archive_owner is null or v_archive_owner <> p_owner_id then
    raise exception 'Archive not found for owner';
  end if;

  update public.collection_publications
  set unpublished_at = now(), updated_at = now()
  where archive_id = p_archive_id
    and collection_local_id = p_collection_local_id
    and unpublished_at is null;
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

revoke all on function public.publish_collection(uuid, uuid, text, text, public.collection_publication_visibility, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.unpublish_collection(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.publish_collection(uuid, uuid, text, text, public.collection_publication_visibility, text, text, text, text, jsonb) to service_role;
grant execute on function public.unpublish_collection(uuid, uuid, text) to service_role;
