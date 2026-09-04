-- Following a published collection. A follow only ever references a
-- collection_publications row, never private archive data, so this table
-- needs no service-role RPC: authenticated users manage their own rows
-- directly under RLS, the same way owners manage their own archives row in
-- 20260904120000_synced_archives.sql.
create table public.collection_follows (
  publication_id uuid not null references public.collection_publications(id) on delete cascade,
  follower_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (publication_id, follower_id)
);

create index collection_follows_follower_idx
  on public.collection_follows (follower_id, created_at desc);

alter table public.collection_follows enable row level security;

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

comment on table public.collection_follows is
  'A follower''s subscription to a published collection. Deleted automatically if the collection or the follower''s account is removed.';
