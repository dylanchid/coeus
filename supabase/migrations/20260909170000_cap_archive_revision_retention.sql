-- Retention used to require a revision to be both old and outside the recent
-- count window. A frequently syncing archive could therefore retain thousands
-- of full JSONB snapshots for 30 days. Keep the current revision, but prune
-- any older revision once either retention bound is exceeded.
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
  v_current_revision bigint;
  v_cutoff_revision bigint;
  v_deleted integer;
begin
  select current_revision into v_current_revision
  from public.archives
  where id = p_archive_id;

  if v_current_revision is null then
    return 0;
  end if;
  v_cutoff_revision := v_current_revision - greatest(p_keep_count, 1);

  delete from public.archive_revisions
  where archive_id = p_archive_id
    and revision <> v_current_revision
    and (
      revision <= v_cutoff_revision
      or created_at < now() - make_interval(days => greatest(p_keep_days, 0))
    );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_archive_revisions(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.prune_archive_revisions(uuid, integer, integer) to service_role;

comment on function public.prune_archive_revisions(uuid, integer, integer) is
  'Prunes non-current archive snapshots that exceed either the revision-count or age retention bound.';
