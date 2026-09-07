-- Sub-epic 4 of docs/profile-page-plan.md — handle changes with redirects.
-- Task nfq.4.1: the history table, the quarantine rule, and the atomic swap.
--
-- Phase 1 built the seam for this on purpose: every handle lookup already goes
-- through resolveHandle() (src/lib/profileStore.server.ts), which returns
-- { profile, redirectFrom }. Task 4.2 fills redirectFrom from this table; task
-- 4.3 drops handle immutability from the save path and calls change_handle()
-- below, adding the per-account rate limit and the typed API errors on top.
--
-- Depends on:
--   public.profiles   (20260905132000_profiles.sql)

-- ---------------------------------------------------------------------------
-- A. handle_history — every handle a profile has released
-- ---------------------------------------------------------------------------
--
-- old_handle is the primary key, and that is deliberately the whole quarantine
-- mechanism: while a row exists the handle is spoken for, so a released handle
-- cannot be silently reclaimed by an impersonator the moment the profiles row
-- frees it. Whether the row still *blocks* a claim is a claim-time decision —
-- see public.handle_available() below.
--
-- The check mirrors profiles.handle exactly (^[a-z0-9_]{3,20}$): a handle that
-- could never have been on a profile could never be released.
create table public.handle_history (
  old_handle text primary key check (old_handle ~ '^[a-z0-9_]{3,20}$'),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  released_at timestamptz not null default now()
);

-- "which handles has this profile released, newest first" — for the rate limit
-- in task 4.3 (at most N changes per rolling year, counted here) and for the
-- original-owner exemption lookup.
create index handle_history_profile_idx
  on public.handle_history (profile_id, released_at desc);

alter table public.handle_history enable row level security;

-- Publicly readable: resolving a retired /@handle URL is an anonymous request.
-- No client writes at all — change_handle() below writes this table through a
-- security-definer function, in the same statement-group as the profiles
-- update, so a crash between the two can never leave a handle both free and
-- unclaimable.
create policy "handle history is publicly readable" on public.handle_history for select
  using (true);

comment on table public.handle_history is
  'Every handle a profile has released. Old links resolve through it (resolveHandle -> redirectFrom); a row also quarantines the handle against third-party reclaim for 30 days. Written only by public.change_handle() (task 4.3 wires it into the profile API), never by a client.';
comment on column public.handle_history.old_handle is
  'The released handle. Primary key: a handle appears at most once; a re-released handle UPSERTs this row (new profile_id, new released_at).';
comment on column public.handle_history.released_at is
  'When the handle was given up. The 30-day quarantine in public.handle_available() is measured from here.';

-- ---------------------------------------------------------------------------
-- B. handle_available() — the claim-time quarantine rule
-- ---------------------------------------------------------------------------
--
-- A handle may be claimed by p_claimant when it is:
--   1. not currently held by any profile (profiles.handle unique is still the
--      real enforcement — this is an advisory pre-check so the caller can raise
--      a friendly error instead of catching 23505), AND
--   2. either never released, OR released more than 30 days ago, OR released by
--      p_claimant themselves.
--
-- The original-owner exemption exists because the quarantine protects against
-- impersonation by a third party, not against someone changing their mind and
-- taking their own handle back.
--
-- 30 days is inlined rather than a settings row: it is a policy constant the
-- tests pin, not something an operator tunes per environment.
create or replace function public.handle_available(p_handle text, p_claimant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1 from public.profiles where profiles.handle = p_handle
    )
    and not exists (
      select 1 from public.handle_history
      where handle_history.old_handle = p_handle
        and handle_history.released_at > now() - interval '30 days'
        and handle_history.profile_id is distinct from p_claimant
    );
$$;

comment on function public.handle_available(text, uuid) is
  'True when p_claimant may take p_handle: unused in profiles AND (never released, or released >30 days ago, or released by p_claimant). Advisory — profiles.handle unique is the hard guarantee.';

-- ---------------------------------------------------------------------------
-- C. change_handle() — release the old handle and take the new one, atomically
-- ---------------------------------------------------------------------------
--
-- One security-definer function so the history insert and the profiles update
-- commit together or not at all (mirrors publish_collection in
-- 20260904140000_collection_publications.sql). Task 4.3 calls this from
-- SupabaseProfileStore.save() and maps the two custom errcodes to typed errors:
--
--   23505  -> HandleTakenError        -> 409 { field: "handle" }
--   HQ001  -> HandleQuarantinedError  -> 409 with a distinct message
--
-- The shape check is NOT repeated here — validateProfileInput has already run
-- in the API layer and the profiles.handle CHECK constraint is the backstop.
create or replace function public.change_handle(p_profile_id uuid, p_new_handle text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_handle text;
  v_row public.profiles;
begin
  select handle into v_old_handle from public.profiles where id = p_profile_id;
  if v_old_handle is null then
    raise exception 'Profile % not found', p_profile_id using errcode = 'no_data_found';
  end if;

  -- Idempotent no-op: asking for the handle you already hold changes nothing
  -- and must not write a history row.
  if v_old_handle = p_new_handle then
    select * into v_row from public.profiles where id = p_profile_id;
    return v_row;
  end if;

  if not public.handle_available(p_new_handle, p_profile_id) then
    if exists (select 1 from public.profiles where handle = p_new_handle) then
      raise exception 'Handle % is taken', p_new_handle using errcode = '23505';
    else
      raise exception 'Handle % was released by another account less than 30 days ago', p_new_handle
        using errcode = 'HQ001';
    end if;
  end if;

  -- Release the outgoing handle. UPSERT: this handle may have passed through
  -- someone else's hands before and still carry a (now stale) history row.
  insert into public.handle_history (old_handle, profile_id, released_at)
  values (v_old_handle, p_profile_id, now())
  on conflict (old_handle)
  do update set profile_id = excluded.profile_id, released_at = excluded.released_at;

  -- The incoming handle stops being "retired": either p_claimant is reclaiming
  -- their own released handle, or its quarantine has lapsed. Either way no old
  -- link should redirect to it any more.
  delete from public.handle_history where old_handle = p_new_handle;

  update public.profiles set handle = p_new_handle
  where id = p_profile_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.change_handle(uuid, text) is
  'Atomically release p_profile_id''s current handle into handle_history and set it to p_new_handle. Raises 23505 (taken) or HQ001 (quarantined by another account). No-op when p_new_handle already equals the current handle.';

revoke all on function public.handle_available(text, uuid) from public, anon, authenticated;
revoke all on function public.change_handle(uuid, text) from public, anon, authenticated;
grant execute on function public.handle_available(text, uuid) to service_role;
grant execute on function public.change_handle(uuid, text) to service_role;
