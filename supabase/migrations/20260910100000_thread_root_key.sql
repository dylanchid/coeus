-- A thread page must be complete: applying a global LIMIT while recursively
-- walking `parent_id` would make descendants beyond that limit unreachable on
-- every later keyset page.  Persist the root id on each reply instead.  This
-- turns the two read RPCs into bounded index scans while preserving the
-- existing all-depth pagination contract.

alter table public.replies add column thread_root_id uuid;

-- Existing rows predate the key. Roots identify themselves; the recursive
-- backfill then stamps every descendant with that root. Reply creation has
-- always required an existing parent, so the graph is a forest.
update public.replies set thread_root_id = id where parent_id is null;

with recursive threaded as (
  select id, thread_root_id
  from public.replies
  where parent_id is null
  union all
  select child.id, threaded.thread_root_id
  from public.replies child
  join threaded on child.parent_id = threaded.id
)
update public.replies reply
set thread_root_id = threaded.thread_root_id
from threaded
where reply.id = threaded.id
  and reply.thread_root_id is distinct from threaded.thread_root_id;

alter table public.replies alter column thread_root_id set not null;

create index replies_thread_root_page_idx
  on public.replies (thread_root_id, created_at asc, id asc);

-- Keep the key correct even if a privileged maintenance path inserts a reply
-- directly rather than using create_reply(). `id` is generated before a
-- BEFORE INSERT trigger runs, so a root can safely key itself.
create function public.stamp_reply_thread_root()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is null then
    new.thread_root_id := new.id;
  else
    select thread_root_id into new.thread_root_id
    from public.replies
    where id = new.parent_id;
    if new.thread_root_id is null then
      raise exception 'Parent reply % does not exist or has no thread root', new.parent_id using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

create trigger replies_stamp_thread_root
before insert on public.replies
for each row execute function public.stamp_reply_thread_root();

-- The public signature stays stable for PostgREST. The root-key index means
-- only p_limit + 1 rows cross the RPC boundary and no recursive work happens
-- on a read path.
create or replace function public.thread_descendants(
  p_root_id uuid,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_limit int
)
returns setof public.replies
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.replies r
  where r.thread_root_id = p_root_id
    and r.id <> p_root_id
    and (
      p_after_created_at is null
      or (r.created_at, r.id) > (p_after_created_at, p_after_id)
    )
  order by r.created_at asc, r.id asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.thread_descendant_counts(p_root_ids uuid[])
returns table (root_id uuid, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.thread_root_id as root_id, count(*)::bigint as total
  from public.replies r
  where r.thread_root_id = any(p_root_ids)
    and r.id <> r.thread_root_id
  group by r.thread_root_id;
$$;

revoke all on function public.stamp_reply_thread_root() from public, anon, authenticated;
revoke all on function public.thread_descendants(uuid, timestamptz, uuid, int) from public, anon, authenticated;
revoke all on function public.thread_descendant_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.thread_descendants(uuid, timestamptz, uuid, int) to service_role;
grant execute on function public.thread_descendant_counts(uuid[]) to service_role;
