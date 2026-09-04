-- Recovery creates a new immutable revision; it never rewrites historical state.
create or replace function public.restore_archive_revision(
  p_owner_id uuid,
  p_archive_id uuid,
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns table (restored boolean, snapshot jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_revision bigint;
  v_next_revision bigint;
begin
  select current_revision into v_current_revision
  from public.archives
  where id = p_archive_id and owner_id = p_owner_id
  for update;

  if not found or v_current_revision <> p_expected_revision then
    return query select false, null::jsonb;
    return;
  end if;

  v_next_revision := v_current_revision + 1;
  if (p_snapshot ->> 'revision')::bigint <> v_next_revision then
    raise exception 'invalid recovery revision';
  end if;

  insert into public.archive_revisions (
    archive_id, revision, parent_revision, sync_version, archive_version, snapshot
  ) values (
    p_archive_id, v_next_revision, v_current_revision,
    (p_snapshot ->> 'syncVersion')::integer,
    (p_snapshot -> 'archive' ->> 'version')::integer,
    p_snapshot
  );
  update public.archives set current_revision = v_next_revision, updated_at = now() where id = p_archive_id;
  return query select true, p_snapshot;
end;
$$;

revoke all on function public.restore_archive_revision(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.restore_archive_revision(uuid, uuid, bigint, jsonb) to service_role;
