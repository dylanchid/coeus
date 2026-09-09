-- Persist every external write from a bounded worker tick in one transaction.
-- This prevents a large first sync from spending most of its lease on RPC
-- round-trips while preserving the watermark and attempt-log semantics of the
-- original one-item function.
create or replace function public.record_delivery_outcomes(
  p_owner_id uuid,
  p_archive_id uuid,
  p_kind public.destination_kind,
  p_outcomes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archive_owner uuid;
  v_destination_id uuid;
begin
  select owner_id into v_archive_owner from public.archives where archives.id = p_archive_id;
  if v_archive_owner is null or v_archive_owner <> p_owner_id then
    raise exception 'Archive not found for owner';
  end if;

  select destinations.id into v_destination_id
  from public.destinations
  where destinations.archive_id = p_archive_id and destinations.kind = p_kind;
  if v_destination_id is null then
    raise exception 'Destination not found';
  end if;

  with outcomes as (
    select * from jsonb_to_recordset(p_outcomes) as o(
      item_id text,
      external_ref text,
      delivered_revision bigint,
      status public.destination_delivery_status,
      http_status integer,
      error text
    )
  )
  insert into public.destination_deliveries (
    destination_id, item_id, external_ref, last_delivered_revision, status, last_attempted_at, last_error, last_http_status
  )
  select
    v_destination_id, item_id, external_ref,
    case when status = 'delivered' then delivered_revision else 0 end,
    status, now(), error, http_status
  from outcomes
  on conflict on constraint destination_deliveries_pkey do update set
    external_ref = coalesce(excluded.external_ref, destination_deliveries.external_ref),
    last_delivered_revision = case when excluded.status = 'delivered' then excluded.last_delivered_revision else destination_deliveries.last_delivered_revision end,
    status = excluded.status,
    last_attempted_at = excluded.last_attempted_at,
    last_error = excluded.last_error,
    last_http_status = excluded.last_http_status;

  insert into public.destination_delivery_attempts (destination_id, item_id, status, http_status, error)
  select v_destination_id, item_id, status, http_status, error
  from jsonb_to_recordset(p_outcomes) as o(
    item_id text,
    external_ref text,
    delivered_revision bigint,
    status public.destination_delivery_status,
    http_status integer,
    error text
  );
end;
$$;

revoke all on function public.record_delivery_outcomes(uuid, uuid, public.destination_kind, jsonb) from public, anon, authenticated;
grant execute on function public.record_delivery_outcomes(uuid, uuid, public.destination_kind, jsonb) to service_role;
