-- Synced archive foundation for Supabase Postgres + Auth + private Storage.
create table public.archives (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  current_revision bigint not null default 0 check (current_revision >= 0),
  sync_version integer not null default 1 check (sync_version = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.archive_revisions (
  archive_id uuid not null references public.archives(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  parent_revision bigint check (parent_revision >= 0),
  sync_version integer not null default 1 check (sync_version = 1),
  archive_version integer not null default 1 check (archive_version = 1),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (archive_id, revision),
  check ((revision = 0 and parent_revision is null) or parent_revision = revision - 1)
);

create table public.archive_operations (
  archive_id uuid not null references public.archives(id) on delete cascade,
  operation_id text not null check (char_length(operation_id) between 1 and 160),
  client_id text not null check (char_length(client_id) between 1 and 160),
  base_revision bigint not null check (base_revision >= 0),
  applied_revision bigint not null check (applied_revision >= 0),
  operation jsonb not null,
  conflicts jsonb not null default '[]'::jsonb,
  accepted boolean not null,
  created_at timestamptz not null default now(),
  primary key (archive_id, operation_id),
  foreign key (archive_id, applied_revision)
    references public.archive_revisions(archive_id, revision) on delete cascade
);

create type public.content_snapshot_status as enum ('pending', 'ready', 'failed', 'deleted');

create table public.content_snapshots (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  item_id text not null check (char_length(item_id) between 1 and 160),
  canonical_url text not null check (canonical_url ~ '^https?://'),
  fetched_url text check (fetched_url is null or fetched_url ~ '^https?://'),
  object_path text unique,
  status public.content_snapshot_status not null default 'pending',
  media_type text,
  byte_length bigint check (byte_length is null or byte_length >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (archive_id, item_id, sha256)
);

create index archive_revisions_created_at_idx
  on public.archive_revisions (archive_id, created_at desc);
create index content_snapshots_item_idx
  on public.content_snapshots (archive_id, item_id, created_at desc);

alter table public.archives enable row level security;
alter table public.archive_revisions enable row level security;
alter table public.archive_operations enable row level security;
alter table public.content_snapshots enable row level security;

create policy "owners read their archive" on public.archives for select
  using (owner_id = (select auth.uid()));
create policy "owners create their archive" on public.archives for insert
  with check (owner_id = (select auth.uid()));
create policy "owners update their archive" on public.archives for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "owners read archive revisions" on public.archive_revisions for select
  using (exists (select 1 from public.archives where archives.id = archive_id and archives.owner_id = (select auth.uid())));
create policy "owners read archive operations" on public.archive_operations for select
  using (exists (select 1 from public.archives where archives.id = archive_id and archives.owner_id = (select auth.uid())));
create policy "owners read content snapshot metadata" on public.content_snapshots for select
  using (exists (select 1 from public.archives where archives.id = archive_id and archives.owner_id = (select auth.uid())));

-- Writes to revisions, operations, and snapshots are intentionally service-role only.
-- The authenticated archive API validates and applies a batch in one transaction.
insert into storage.buckets (id, name, public)
values ('archive-snapshots', 'archive-snapshots', false)
on conflict (id) do update set public = false;

create policy "owners read captured content" on storage.objects for select to authenticated
  using (
    bucket_id = 'archive-snapshots'
    and exists (
      select 1 from public.archives
      where archives.id::text = (storage.foldername(name))[2]
        and archives.owner_id = (select auth.uid())
    )
  );

comment on table public.archive_revisions is
  'Immutable, versioned archive snapshots. Retention policy is applied only after export/recovery ships.';
comment on column public.content_snapshots.canonical_url is
  'The original canonical source remains required even when captured content exists.';

create or replace function public.initialize_archive(
  p_owner_id uuid,
  p_snapshot jsonb
)
returns table (archive_id uuid, current_revision bigint, snapshot jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archive_id uuid;
begin
  insert into public.archives (owner_id)
  values (p_owner_id)
  on conflict (owner_id) do update set owner_id = excluded.owner_id
  returning id into v_archive_id;

  insert into public.archive_revisions (
    archive_id, revision, parent_revision, sync_version, archive_version, snapshot
  ) values (v_archive_id, 0, null, 1, 1, p_snapshot)
  on conflict on constraint archive_revisions_pkey do nothing;

  return query
  select archive.id, archive.current_revision, revision.snapshot
  from public.archives as archive
  join public.archive_revisions as revision
    on revision.archive_id = archive.id
   and revision.revision = archive.current_revision
  where archive.id = v_archive_id;
end;
$$;

create or replace function public.commit_archive_sync(
  p_owner_id uuid,
  p_archive_id uuid,
  p_expected_revision bigint,
  p_snapshot jsonb,
  p_operations jsonb
)
returns table (committed boolean, current_revision bigint, snapshot jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_revision bigint;
  v_next_revision bigint;
begin
  select archive.current_revision into v_current_revision
  from public.archives as archive
  where archive.id = p_archive_id and archive.owner_id = p_owner_id
  for update;

  if not found then
    return query select false, null::bigint, null::jsonb;
    return;
  end if;

  if v_current_revision <> p_expected_revision then
    return query
    select false, revision.revision, revision.snapshot
    from public.archive_revisions as revision
    where revision.archive_id = p_archive_id
      and revision.revision = v_current_revision;
    return;
  end if;

  v_next_revision := (p_snapshot ->> 'revision')::bigint;
  if v_next_revision not in (v_current_revision, v_current_revision + 1) then
    raise exception 'invalid next archive revision';
  end if;

  if v_next_revision = v_current_revision + 1 then
    insert into public.archive_revisions (
      archive_id, revision, parent_revision, sync_version, archive_version, snapshot
    ) values (
      p_archive_id,
      v_next_revision,
      v_current_revision,
      (p_snapshot ->> 'syncVersion')::integer,
      (p_snapshot -> 'archive' ->> 'version')::integer,
      p_snapshot
    );
    update public.archives
    set current_revision = v_next_revision, updated_at = now()
    where id = p_archive_id;
  end if;

  insert into public.archive_operations (
    archive_id,
    operation_id,
    client_id,
    base_revision,
    applied_revision,
    operation,
    conflicts,
    accepted
  )
  select
    p_archive_id,
    entry ->> 'operationId',
    entry ->> 'clientId',
    (entry ->> 'baseRevision')::bigint,
    v_next_revision,
    entry -> 'operation',
    coalesce(entry -> 'conflicts', '[]'::jsonb),
    coalesce((entry ->> 'accepted')::boolean, false)
  from jsonb_array_elements(p_operations) as entry
  on conflict (archive_id, operation_id) do nothing;

  return query select true, v_next_revision, p_snapshot;
end;
$$;

revoke all on function public.initialize_archive(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.commit_archive_sync(uuid, uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.initialize_archive(uuid, jsonb) to service_role;
grant execute on function public.commit_archive_sync(uuid, uuid, bigint, jsonb, jsonb) to service_role;
