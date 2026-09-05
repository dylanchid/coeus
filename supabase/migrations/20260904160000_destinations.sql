-- Destination sync adapters (Obsidian via a GitHub git bridge, Notion via OAuth) push a
-- read-only mirror of a user's archive to a third-party system. Bareaga's own archive
-- remains authoritative; disconnecting a destination never touches archive data.
create type public.destination_kind as enum ('obsidian_git', 'notion');
create type public.destination_status as enum ('active', 'auth_error', 'disabled');
create type public.destination_delivery_status as enum ('pending', 'delivered', 'failed_retryable', 'failed_auth', 'deleted_remote');

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  kind public.destination_kind not null,
  status public.destination_status not null default 'active',
  display_name text not null check (char_length(display_name) between 1 and 200),
  config jsonb not null default '{}'::jsonb,
  secret_ciphertext bytea,
  secret_iv bytea,
  secret_auth_tag bytea,
  secret_version integer not null default 1 check (secret_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (archive_id, kind)
);

create table public.destination_deliveries (
  destination_id uuid not null references public.destinations(id) on delete cascade,
  item_id text not null check (char_length(item_id) between 1 and 160),
  external_ref text,
  last_delivered_revision bigint not null default 0 check (last_delivered_revision >= 0),
  status public.destination_delivery_status not null default 'pending',
  last_attempted_at timestamptz,
  last_error text,
  last_http_status integer,
  primary key (destination_id, item_id)
);

create table public.destination_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  item_id text not null check (char_length(item_id) between 1 and 160),
  status public.destination_delivery_status not null,
  http_status integer,
  error text,
  attempted_at timestamptz not null default now()
);

create index destinations_archive_idx
  on public.destinations (archive_id);
create index destination_deliveries_status_idx
  on public.destination_deliveries (destination_id, status);
create index destination_delivery_attempts_idx
  on public.destination_delivery_attempts (destination_id, item_id, attempted_at desc);

alter table public.destinations enable row level security;
alter table public.destination_deliveries enable row level security;
alter table public.destination_delivery_attempts enable row level security;

-- Deliberately zero client-role policies: these rows hold encrypted secrets and delivery
-- diagnostics. RLS with no policies denies anon/authenticated entirely; every access path
-- goes through service_role via SupabaseDestinationsStore, never PostgREST directly.

comment on table public.destinations is
  'A user-connected push destination (Obsidian via GitHub, or Notion). Secrets are AES-256-GCM ciphertext encrypted in Node; the key never enters Postgres.';
comment on column public.destinations.config is
  'Non-secret adapter config: {repo, branch, pathPrefix} for obsidian_git, {databaseId, workspaceName} for notion.';
comment on table public.destination_deliveries is
  'Per-item delivery watermark. external_ref is preserved across disconnect/reconnect so a reconnect never recreates already-delivered pages/files.';
comment on table public.destination_delivery_attempts is
  'Append-only log of delivery attempts, for surfacing failure history in the UI.';

create or replace function public.create_destination(
  p_owner_id uuid,
  p_archive_id uuid,
  p_kind public.destination_kind,
  p_display_name text,
  p_config jsonb,
  p_secret_ciphertext bytea,
  p_secret_iv bytea,
  p_secret_auth_tag bytea
)
returns table (
  id uuid,
  kind public.destination_kind,
  status public.destination_status,
  display_name text,
  config jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
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

  -- Reconnecting an existing (archive_id, kind) destination reuses the same row so that
  -- destination_deliveries.external_ref history survives disconnect/reconnect.
  insert into public.destinations (
    archive_id, kind, display_name, config, secret_ciphertext, secret_iv, secret_auth_tag
  ) values (
    p_archive_id, p_kind, p_display_name, p_config, p_secret_ciphertext, p_secret_iv, p_secret_auth_tag
  )
  on conflict on constraint destinations_archive_id_kind_key do update set
    display_name = excluded.display_name,
    config = excluded.config,
    secret_ciphertext = excluded.secret_ciphertext,
    secret_iv = excluded.secret_iv,
    secret_auth_tag = excluded.secret_auth_tag,
    secret_version = destinations.secret_version + 1,
    status = 'active',
    updated_at = now()
  returning destinations.id into v_destination_id;

  return query
  select destinations.id, destinations.kind, destinations.status, destinations.display_name,
         destinations.config, destinations.created_at, destinations.updated_at
  from public.destinations
  where destinations.id = v_destination_id;
end;
$$;

create or replace function public.disconnect_destination(
  p_owner_id uuid,
  p_archive_id uuid,
  p_kind public.destination_kind
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
    secret_ciphertext = null,
    secret_iv = null,
    secret_auth_tag = null,
    status = 'disabled',
    updated_at = now()
  where archive_id = p_archive_id and kind = p_kind;
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

create or replace function public.purge_destination(
  p_owner_id uuid,
  p_archive_id uuid,
  p_kind public.destination_kind
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

  delete from public.destinations where archive_id = p_archive_id and kind = p_kind;
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

create or replace function public.mark_destination_status(
  p_owner_id uuid,
  p_archive_id uuid,
  p_kind public.destination_kind,
  p_status public.destination_status
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

  update public.destinations set status = p_status, updated_at = now()
  where archive_id = p_archive_id and kind = p_kind;
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

create or replace function public.record_delivery_outcome(
  p_owner_id uuid,
  p_archive_id uuid,
  p_kind public.destination_kind,
  p_item_id text,
  p_external_ref text,
  p_delivered_revision bigint,
  p_status public.destination_delivery_status,
  p_http_status integer,
  p_error text
)
returns table (
  item_id text,
  external_ref text,
  last_delivered_revision bigint,
  status public.destination_delivery_status
)
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

  insert into public.destination_deliveries (
    destination_id, item_id, external_ref, last_delivered_revision, status, last_attempted_at, last_error, last_http_status
  ) values (
    v_destination_id, p_item_id, p_external_ref,
    case when p_status = 'delivered' then p_delivered_revision else 0 end,
    p_status, now(), p_error, p_http_status
  )
  on conflict on constraint destination_deliveries_pkey do update set
    external_ref = coalesce(excluded.external_ref, destination_deliveries.external_ref),
    last_delivered_revision = case when p_status = 'delivered' then p_delivered_revision else destination_deliveries.last_delivered_revision end,
    status = excluded.status,
    last_attempted_at = excluded.last_attempted_at,
    last_error = excluded.last_error,
    last_http_status = excluded.last_http_status;

  insert into public.destination_delivery_attempts (destination_id, item_id, status, http_status, error)
  values (v_destination_id, p_item_id, p_status, p_http_status, p_error);

  return query
  select destination_deliveries.item_id, destination_deliveries.external_ref,
         destination_deliveries.last_delivered_revision, destination_deliveries.status
  from public.destination_deliveries
  where destination_deliveries.destination_id = v_destination_id and destination_deliveries.item_id = p_item_id;
end;
$$;

revoke all on function public.create_destination(uuid, uuid, public.destination_kind, text, jsonb, bytea, bytea, bytea) from public, anon, authenticated;
revoke all on function public.disconnect_destination(uuid, uuid, public.destination_kind) from public, anon, authenticated;
revoke all on function public.purge_destination(uuid, uuid, public.destination_kind) from public, anon, authenticated;
revoke all on function public.mark_destination_status(uuid, uuid, public.destination_kind, public.destination_status) from public, anon, authenticated;
revoke all on function public.record_delivery_outcome(uuid, uuid, public.destination_kind, text, text, bigint, public.destination_delivery_status, integer, text) from public, anon, authenticated;

grant execute on function public.create_destination(uuid, uuid, public.destination_kind, text, jsonb, bytea, bytea, bytea) to service_role;
grant execute on function public.disconnect_destination(uuid, uuid, public.destination_kind) to service_role;
grant execute on function public.purge_destination(uuid, uuid, public.destination_kind) to service_role;
grant execute on function public.mark_destination_status(uuid, uuid, public.destination_kind, public.destination_status) to service_role;
grant execute on function public.record_delivery_outcome(uuid, uuid, public.destination_kind, text, text, bigint, public.destination_delivery_status, integer, text) to service_role;
