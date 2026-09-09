-- Follow-up to the bt0 bounding slice (docs/profile-page-plan.md): the profile
-- Replies tab caps thread descendants at REPLY_DESCENDANT_LIMIT (200) per level,
-- two levels deep (childrenOf in conversationProfileStore.server.ts). A busier
-- thread is silently truncated, and replies deeper than level 3 never load at
-- all. bareaga_web-kxe adds a dedicated thread page that walks EVERY descendant
-- of one root with a stable keyset cursor, plus a count so the tab can link to
-- it ("View all N replies").
--
-- parent_id nests to any depth, so "all descendants" is a recursive walk. Doing
-- it in one SQL function keeps the fan-out bounded (LIMIT inside the CTE) and
-- off the app's query budget — the alternative, repeated `.in(parent_id, ...)`
-- hops in the client, cannot page by created_at without first loading the whole
-- subtree.
--
-- Both functions are STABLE reads, called only through the service-role admin
-- client (the visibility cut is canSeeIndirect / canSee in the derive layer,
-- exactly as every other conversation read). security definer + an empty
-- search_path + the same revoke/grant set as the Phase 3 RPCs.

-- ---------------------------------------------------------------------------
-- thread_descendants() — one keyset page of every reply beneath p_root_id,
-- oldest first. The cursor is the (created_at, id) of the last row returned;
-- pass both back as p_after_* for the next page, or nulls for the first.
-- ---------------------------------------------------------------------------
create function public.thread_descendants(
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
  with recursive descendants as (
    select r.*
    from public.replies r
    where r.parent_id = p_root_id
    union all
    select r.*
    from public.replies r
    join descendants d on r.parent_id = d.id
  )
  select *
  from descendants
  where p_after_created_at is null
     or (created_at, id) > (p_after_created_at, p_after_id)
  order by created_at asc, id asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.thread_descendants(uuid, timestamptz, uuid, int) is
  'One keyset page (created_at asc, id asc) of every reply nested beneath p_root_id, at any depth. Backs the dedicated thread page (bareaga_web-kxe). Reads only; the visibility cut is canSeeIndirect/canSee in src/lib/threadPage.ts.';

-- ---------------------------------------------------------------------------
-- thread_descendant_counts() — total descendants for each of p_root_ids, so
-- the Replies tab knows which threads are truncated and how many replies the
-- full thread holds. One call for every root on a profile render.
-- ---------------------------------------------------------------------------
create function public.thread_descendant_counts(p_root_ids uuid[])
returns table (root_id uuid, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive descendants as (
    select r.id, r.parent_id, r.parent_id as root_id
    from public.replies r
    where r.parent_id = any(p_root_ids)
    union all
    select r.id, r.parent_id, d.root_id
    from public.replies r
    join descendants d on r.parent_id = d.id
  )
  -- A root with no descendants is simply absent from the result; the caller
  -- reads a missing key as zero.
  select root_id, count(*)::bigint
  from descendants
  group by root_id;
$$;

comment on function public.thread_descendant_counts(uuid[]) is
  'Total nested descendant count per root reply id. Lets the profile Replies tab surface a "View all N replies" link when a thread runs past what the tab loads (bareaga_web-kxe).';

revoke all on function public.thread_descendants(uuid, timestamptz, uuid, int) from public, anon, authenticated;
revoke all on function public.thread_descendant_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.thread_descendants(uuid, timestamptz, uuid, int) to service_role;
grant execute on function public.thread_descendant_counts(uuid[]) to service_role;
