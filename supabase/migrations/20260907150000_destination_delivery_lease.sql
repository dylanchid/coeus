-- Destination delivery runs from three places that can overlap: the post-sync
-- after() hook, the manual "sync now" route, and the daily cron sweep. Without a
-- durable lease, two runs can each observe no external_ref for the same item and
-- both create a remote page (duplicate Notion pages), and the per-invocation
-- in-process rate budget never limits separate invocations.
--
-- This adds a per-destination lease that is:
--   * mutually exclusive across instances (atomic conditional UPDATE), and
--   * a cross-invocation rate limit (a minimum interval between runs), so a
--     flurry of syncs collapses to one delivery run per window.

alter table public.destinations
  add column delivery_lease_token uuid,
  add column delivery_lease_expires_at timestamptz,
  add column delivery_started_at timestamptz,
  add column delivery_finished_at timestamptz,
  add column delivery_last_outcome jsonb;

comment on column public.destinations.delivery_lease_token is
  'Non-null while a delivery run holds this destination. Cleared on release or when delivery_lease_expires_at passes.';
comment on column public.destinations.delivery_last_outcome is
  'Redaction-safe summary of the last delivery run (counts, status, correlation id). Never contains secrets or archive content.';

-- Atomically take the lease. Returns true only if this caller now owns it.
-- Denied when: the destination is not active, another live lease is held, or the
-- previous run started less than p_min_interval_seconds ago (the rate limit).
create or replace function public.acquire_destination_delivery_lease(
  p_owner_id uuid,
  p_archive_id uuid,
  p_kind public.destination_kind,
  p_lease_token uuid,
  p_ttl_seconds integer,
  p_min_interval_seconds integer
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
  select owner_id into v_archive_owner from public.archives where archives.id = p_archive_id;
  if v_archive_owner is null or v_archive_owner <> p_owner_id then
    raise exception 'Archive not found for owner';
  end if;

  update public.destinations set
    delivery_lease_token = p_lease_token,
    delivery_lease_expires_at = now() + make_interval(secs => greatest(p_ttl_seconds, 1)),
    delivery_started_at = now()
  where destinations.archive_id = p_archive_id
    and destinations.kind = p_kind
    and destinations.status = 'active'
    and (destinations.delivery_lease_token is null
         or destinations.delivery_lease_expires_at is null
         or destinations.delivery_lease_expires_at < now())
    and (p_min_interval_seconds <= 0
         or destinations.delivery_started_at is null
         or destinations.delivery_started_at < now() - make_interval(secs => p_min_interval_seconds));
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

-- Release a lease this caller holds and record the run's outcome. A mismatched
-- token (a slow run whose lease already expired and was retaken) is a no-op.
create or replace function public.release_destination_delivery_lease(
  p_owner_id uuid,
  p_archive_id uuid,
  p_kind public.destination_kind,
  p_lease_token uuid,
  p_outcome jsonb
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
  select owner_id into v_archive_owner from public.archives where archives.id = p_archive_id;
  if v_archive_owner is null or v_archive_owner <> p_owner_id then
    raise exception 'Archive not found for owner';
  end if;

  update public.destinations set
    delivery_lease_token = null,
    delivery_lease_expires_at = null,
    delivery_finished_at = now(),
    delivery_last_outcome = p_outcome
  where destinations.archive_id = p_archive_id
    and destinations.kind = p_kind
    and destinations.delivery_lease_token = p_lease_token;
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

revoke all on function public.acquire_destination_delivery_lease(uuid, uuid, public.destination_kind, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.release_destination_delivery_lease(uuid, uuid, public.destination_kind, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.acquire_destination_delivery_lease(uuid, uuid, public.destination_kind, uuid, integer, integer) to service_role;
grant execute on function public.release_destination_delivery_lease(uuid, uuid, public.destination_kind, uuid, jsonb) to service_role;
