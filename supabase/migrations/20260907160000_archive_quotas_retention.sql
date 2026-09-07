-- Archive quotas, sync rate limits, and revision retention.
--
-- Before this, each accepted sync wrote another full JSON snapshot and kept
-- every revision and operation row forever, the request body cap (2 MiB / 500
-- ops) was the only ceiling, and there was no per-account rate limit. That
-- allows storage amplification and unbounded GET/sync latency. These budgets
-- are enforced at the authoritative database boundary; the service-role sync
-- store mirrors them for better error messages.

-- ---------------------------------------------------------------------------
-- 1. Snapshot budget: a trigger on the immutable revision table, so every
--    write path (initialize_archive, commit_archive_sync) is covered.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_archive_revision_budget()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_array_length(coalesce(new.snapshot -> 'archive' -> 'items', '[]'::jsonb)) > 5000 then
    raise exception 'archive exceeds the 5000-item budget' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(coalesce(new.snapshot -> 'archive' -> 'collections', '[]'::jsonb)) > 2000 then
    raise exception 'archive exceeds the 2000-collection budget' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(coalesce(new.snapshot -> 'archive' -> 'socialPosts', '[]'::jsonb)) > 5000 then
    raise exception 'archive exceeds the 5000-post budget' using errcode = 'check_violation';
  end if;
  if octet_length(new.snapshot::text) > 8 * 1024 * 1024 then
    raise exception 'archive snapshot exceeds the 8 MiB budget' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger archive_revisions_budget
  before insert on public.archive_revisions
  for each row execute function public.enforce_archive_revision_budget();

-- ---------------------------------------------------------------------------
-- 2. Durable, cross-instance per-account sync rate limit (fixed window).
-- ---------------------------------------------------------------------------
create table public.archive_sync_rate (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.archive_sync_rate enable row level security;
-- service-role only: the authenticated API is the sole caller.

comment on table public.archive_sync_rate is
  'Fixed-window sync request counter per account. Reset lazily when the window rolls over.';

create or replace function public.consume_archive_sync_budget(
  p_owner_id uuid,
  p_max integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_started_at timestamptz;
  v_count integer;
begin
  insert into public.archive_sync_rate (owner_id, window_started_at, request_count)
  values (p_owner_id, now(), 0)
  on conflict (owner_id) do nothing;

  select window_started_at, request_count
    into v_window_started_at, v_count
  from public.archive_sync_rate
  where owner_id = p_owner_id
  for update;

  if v_window_started_at < now() - make_interval(secs => greatest(p_window_seconds, 1)) then
    v_window_started_at := now();
    v_count := 0;
  end if;

  if v_count >= greatest(p_max, 1) then
    return query select false,
      greatest(1, ceil(extract(epoch from
        (v_window_started_at + make_interval(secs => greatest(p_window_seconds, 1))) - now()))::integer);
    return;
  end if;

  update public.archive_sync_rate
  set window_started_at = v_window_started_at, request_count = v_count + 1
  where owner_id = p_owner_id;

  return query select true, 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Revision retention: keep the most recent N revisions AND everything from
--    the last M days, whichever is larger. The current revision is always in
--    the recent-N set, so it is never pruned. Pruning a revision cascades to
--    its archive_operations rows.
-- ---------------------------------------------------------------------------
create or replace function public.prune_archive_revisions(
  p_archive_id uuid,
  p_keep_count integer,
  p_keep_days integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff_revision bigint;
  v_deleted integer;
begin
  select current_revision - greatest(p_keep_count, 1)
    into v_cutoff_revision
  from public.archives
  where id = p_archive_id;

  if v_cutoff_revision is null or v_cutoff_revision < 0 then
    return 0;
  end if;

  delete from public.archive_revisions
  where archive_id = p_archive_id
    and revision <= v_cutoff_revision
    and created_at < now() - make_interval(days => greatest(p_keep_days, 0));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.prune_all_archive_revisions(
  p_keep_count integer,
  p_keep_days integer
)
returns table (archive_id uuid, deleted integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select a.id, public.prune_archive_revisions(a.id, p_keep_count, p_keep_days)
  from public.archives as a;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Storage-growth monitoring: one row per archive with revision/operation
--    counts and byte totals, for the health/observability surface.
-- ---------------------------------------------------------------------------
create or replace function public.archive_storage_stats()
returns table (
  archive_id uuid,
  owner_id uuid,
  current_revision bigint,
  revision_count bigint,
  oldest_revision_at timestamptz,
  snapshot_bytes bigint,
  operation_count bigint,
  content_snapshot_count bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    a.id,
    a.owner_id,
    a.current_revision,
    count(distinct r.revision),
    min(r.created_at),
    coalesce(sum(octet_length(r.snapshot::text)), 0),
    (select count(*) from public.archive_operations o where o.archive_id = a.id),
    (select count(*) from public.content_snapshots s where s.archive_id = a.id)
  from public.archives a
  left join public.archive_revisions r on r.archive_id = a.id
  group by a.id, a.owner_id, a.current_revision;
$$;

revoke all on function public.consume_archive_sync_budget(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.prune_archive_revisions(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.prune_all_archive_revisions(integer, integer) from public, anon, authenticated;
revoke all on function public.archive_storage_stats() from public, anon, authenticated;

grant execute on function public.consume_archive_sync_budget(uuid, integer, integer) to service_role;
grant execute on function public.prune_archive_revisions(uuid, integer, integer) to service_role;
grant execute on function public.prune_all_archive_revisions(integer, integer) to service_role;
grant execute on function public.archive_storage_stats() to service_role;

comment on table public.archive_revisions is
  'Immutable, versioned archive snapshots. Retention (prune_archive_revisions) keeps the recent N revisions and the last M days; older revisions and their operation logs are pruned.';
