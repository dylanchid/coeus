-- Migration A of Phase 2 (docs/profile-page-plan.md §6, Finding 03, risk R2).
--
-- Replace the two-value `collection_publication_visibility` enum with a
-- four-value `public.visibility` type: private | followers | unlisted | public,
-- ordered least to most visible.
--
-- This CANNOT be `ALTER TYPE … ADD VALUE`: Postgres will not let a value added
-- inside a transaction be used in that same transaction, and Supabase runs each
-- migration file as one transaction. So it is a new type plus a column swap
-- with `USING` — which drags `publish_collection()` with it, because that
-- function's signature and RETURNS TABLE both name the old type.
--
-- Highest-blast-radius migration in the plan. Nothing else is bundled into this
-- file. A partial application leaves publishing broken for every user.
--
-- 1:1 value map. `unlisted` stays `unlisted`, `public` stays `public`. No
-- existing row becomes more visible.

-- 1. The new type. Order matters: least to most visible.
create type public.visibility as enum ('private', 'followers', 'unlisted', 'public');

-- 2. Add the replacement column, nullable for the backfill.
alter table public.collection_publications
  add column visibility_new public.visibility;

-- 3. Backfill 1:1 via text. Both old labels exist in the new type.
update public.collection_publications
  set visibility_new = visibility::text::public.visibility;

-- 4. Lock it down to match the old column's constraints.
alter table public.collection_publications
  alter column visibility_new set not null,
  alter column visibility_new set default 'unlisted';

-- 5. Drop every policy that references the old column, then drop the old column
--    and rename. Three policies reach it: the two SELECT policies (one here, one
--    on collection_publication_items via a subquery) plus the FOR ALL follows
--    policy on collection_follows, whose WITH CHECK subquery gates new follows
--    to live public/unlisted publications (20260904150000_collection_follows.sql).
--    Dropping the column also drops collection_publications_live_idx.
drop policy "anyone reads live publications" on public.collection_publications;
drop policy "anyone reads items of live publications" on public.collection_publication_items;
drop policy "followers manage their own follows" on public.collection_follows;

alter table public.collection_publications drop column visibility;
alter table public.collection_publications rename column visibility_new to visibility;

-- 6. Recreate the live-discovery index the dropped column took with it.
create index collection_publications_live_idx
  on public.collection_publications (visibility, published_at desc)
  where unpublished_at is null;

-- 7. Drop publish_collection() by its FULL old signature. The old type still
--    exists at this point, so the signature still resolves.
drop function public.publish_collection(uuid, uuid, text, text, public.collection_publication_visibility, text, text, text, text, jsonb);

-- 8. Recreate it with `p_visibility public.visibility`, otherwise byte-for-byte
--    the version from 20260906120000_profile_surface.sql (owner_id carried on
--    the insert branch, never touched on republish).
create or replace function public.publish_collection(
  p_owner_id uuid,
  p_archive_id uuid,
  p_collection_local_id text,
  p_slug text,
  p_visibility public.visibility,
  p_name text,
  p_description text,
  p_curator_note text,
  p_attribution text,
  p_items jsonb
)
returns table (
  publication_id uuid,
  slug text,
  visibility public.visibility,
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

-- 9. A grant does not follow a signature change. Re-apply the revoke/grant pair
--    for the NEW signature. unpublish_collection is untouched by this migration.
revoke all on function public.publish_collection(uuid, uuid, text, text, public.visibility, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.publish_collection(uuid, uuid, text, text, public.visibility, text, text, text, text, jsonb) to service_role;

-- 10. Recreate the three policies against the new column, verbatim from their
--     original migrations. Deliberately kept at the unlisted/public level:
--     `followers` and `private` rows are not readable through RLS at all, and
--     lib/visibility.ts canSee() (task nfq.2.2) does the fine-grained gating in
--     the app. Defense-in-depth, per §6.
create policy "anyone reads live publications" on public.collection_publications for select
  using (unpublished_at is null and visibility in ('public', 'unlisted'));
create policy "anyone reads items of live publications" on public.collection_publication_items for select
  using (exists (
    select 1 from public.collection_publications
    where collection_publications.id = publication_id
      and collection_publications.unpublished_at is null
      and collection_publications.visibility in ('public', 'unlisted')
  ));
create policy "followers manage their own follows" on public.collection_follows for all
  using (follower_id = (select auth.uid()))
  with check (
    follower_id = (select auth.uid())
    and exists (
      select 1 from public.collection_publications
      where collection_publications.id = publication_id
        and collection_publications.unpublished_at is null
        and collection_publications.visibility in ('public', 'unlisted')
    )
  );

-- 11. The old type is now unreferenced. Drop it last.
drop type public.collection_publication_visibility;

comment on type public.visibility is
  'Object-level visibility for collections, posts and reposts: private | followers | unlisted | public, ordered least to most visible. RLS enforces the unlisted/public cut; lib/visibility.ts canSee() gates followers/private.';
