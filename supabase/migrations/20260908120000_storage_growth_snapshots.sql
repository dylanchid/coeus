-- Week-over-week storage-growth state.
--
-- The README "Observability › Alerting" table has a row for
-- `archive_storage_stats` total `snapshot_bytes` growth (> 25%/week warn,
-- > 100%/week page) that the log-threshold backstop cannot cover: it needs a
-- persisted prior reading to diff against. This table holds one row per
-- capture; `capture_storage_growth()` appends a reading and returns it next to
-- the previous one so the weekly workflow (scripts/storage-growth.mts) can
-- compute the rate with the pure evaluator in src/lib/storageGrowth.ts.

create table public.storage_growth_snapshots (
  id                   bigint generated always as identity primary key,
  captured_at          timestamptz not null default now(),
  total_snapshot_bytes bigint      not null,
  archive_count        bigint      not null,
  revision_count       bigint      not null
);

comment on table public.storage_growth_snapshots is
  'One aggregate reading of archive_storage_stats() per weekly capture, for week-over-week growth alerting. Append-only; service-role only.';

create index storage_growth_snapshots_captured_at_idx
  on public.storage_growth_snapshots (captured_at desc);

-- Application data is server-BFF-only (see 20260907100000_lock_down_public_tables);
-- the lockdown migration's default-privilege revoke already closes this table to
-- anon/authenticated. Only the service-role capture path touches it.
grant select, insert on public.storage_growth_snapshots to service_role;

-- ---------------------------------------------------------------------------
-- Append a reading and return it beside the most recent prior one.
-- ---------------------------------------------------------------------------
create or replace function public.capture_storage_growth()
returns table (
  current_bytes  bigint,
  current_at     timestamptz,
  previous_bytes bigint,
  previous_at    timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total     bigint;
  v_archives  bigint;
  v_revisions bigint;
  v_prev      public.storage_growth_snapshots;
  v_new       public.storage_growth_snapshots;
begin
  select
    coalesce(sum(s.snapshot_bytes), 0),
    count(*),
    coalesce(sum(s.revision_count), 0)
  into v_total, v_archives, v_revisions
  from public.archive_storage_stats() s;

  select * into v_prev
  from public.storage_growth_snapshots
  order by captured_at desc, id desc
  limit 1;

  insert into public.storage_growth_snapshots (total_snapshot_bytes, archive_count, revision_count)
  values (v_total, v_archives, v_revisions)
  returning * into v_new;

  return query select
    v_new.total_snapshot_bytes,
    v_new.captured_at,
    v_prev.total_snapshot_bytes,
    v_prev.captured_at;
end;
$$;

revoke all on function public.capture_storage_growth() from public, anon, authenticated;
grant execute on function public.capture_storage_growth() to service_role;
