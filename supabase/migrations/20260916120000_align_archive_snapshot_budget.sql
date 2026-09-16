-- Keep committed snapshots below Vercel's non-streamed 4.5 MB body ceiling.
-- Export and recovery JSON responses are streamed separately because they
-- include revision and content metadata in addition to the current snapshot.
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
  if octet_length(new.snapshot::text) > 4 * 1024 * 1024 then
    raise exception 'archive snapshot exceeds the 4 MiB budget' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
