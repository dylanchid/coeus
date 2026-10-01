-- Reconnecting with a fresh credential must make prior auth failures eligible
-- for delivery again. Delivered watermarks and external refs remain intact.
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

  update public.destination_deliveries as delivery
  set status = 'pending', last_error = null, last_http_status = null
  where delivery.destination_id = v_destination_id and delivery.status = 'failed_auth';

  return query
  select destinations.id, destinations.kind, destinations.status, destinations.display_name,
         destinations.config, destinations.created_at, destinations.updated_at
  from public.destinations
  where destinations.id = v_destination_id;
end;
$$;
