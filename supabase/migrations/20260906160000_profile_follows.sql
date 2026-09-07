-- Migration B of Phase 2 (docs/profile-page-plan.md, Finding 03).
--
-- The person-level follow graph, plus the profile-level display switches that
-- govern which sections of a profile page render.
--
-- profile_follows is the new primary social edge. Until now the only "follow"
-- in the system was collection_follows (20260904150000_collection_follows.sql),
-- a subscription to one published collection — a different relationship. The
-- `followers` visibility tier added in Migration A / canSee() only becomes
-- meaningful once there is a person graph to consult: `followers` means YOUR
-- followers, not mutuals. A follow is one-directional and needs no acceptance.
--
-- Migration C (posts, 20260906150000) landed first out of plan order; it does
-- not read profile_follows, so adding this file after it is safe.

-- ---------------------------------------------------------------------------
-- A. profile_follows — the one-directional person-follow edge
-- ---------------------------------------------------------------------------

-- follower_id references auth.users, not profiles, matching collection_follows:
-- an account can follow before completing onboarding. Any UI listing followers
-- must therefore tolerate a follower with no profile row and omit it.
create table public.profile_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- "who follows @handle, newest first" and "who does @handle follow, newest
-- first". Both are (id, created_at desc) so follower / following counts and
-- listings are an index-only scan.
create index profile_follows_followee_idx
  on public.profile_follows (followee_id, created_at desc);
create index profile_follows_follower_idx
  on public.profile_follows (follower_id, created_at desc);

alter table public.profile_follows enable row level security;

-- RLS mirrors collection_follows: a follower manages only their own rows under
-- a FOR ALL policy keyed on follower_id = auth.uid(). There is no publication
-- to gate against here — profiles are publicly readable (20260905132000) and
-- the followee FK already guarantees the target exists.
create policy "followers manage their own profile follows" on public.profile_follows for all
  using (follower_id = (select auth.uid()))
  with check (follower_id = (select auth.uid()));

-- A separate permissive SELECT policy so follower / following counts are
-- readable by anyone. The show_* switches below do NOT gate this at the
-- database level: profile-page reads go through the admin client and the
-- switches are applied in the view layer, the same division of labour posts
-- and collection_publications already document for the visibility tiers.
create policy "anyone reads profile follows" on public.profile_follows for select
  using (true);

comment on table public.profile_follows is
  'A one-directional person follow: follower_id follows the profile followee_id. No acceptance step. Deleted automatically when either account is removed. follower_id references auth.users, so a follower may have no profile row yet.';

-- ---------------------------------------------------------------------------
-- B. profiles display switches + likes_visibility
-- ---------------------------------------------------------------------------

-- The show_* switches let an owner hide a whole profile section. Defaults are
-- true because these sections only ever contain content the object-level
-- visibility already permits — the switch is a display preference, not an
-- authorization boundary.
--
-- likes_visibility is the object-level tier for the Likes list as a whole.
-- `unlisted` is meaningless for a list (there is no per-like URL to leak), so
-- it is rejected; the default is `public`.
alter table public.profiles
  add column likes_visibility public.visibility not null default 'public'
    check (likes_visibility <> 'unlisted'),
  add column show_followers boolean not null default true,
  add column show_following boolean not null default true,
  add column show_reposts   boolean not null default true,
  add column show_replies   boolean not null default true,
  add column show_likes      boolean not null default true;

comment on column public.profiles.likes_visibility is
  'Object visibility for the Likes list as a whole: private | followers | public (never unlisted). Enforced by canSee() in src/lib/visibility.ts on the read path.';
comment on column public.profiles.show_followers is
  'Owner display switch: render the Followers section on the profile page. Applied in the view layer, not by RLS.';
comment on column public.profiles.show_following is
  'Owner display switch: render the Following section on the profile page. Applied in the view layer, not by RLS.';
comment on column public.profiles.show_reposts is
  'Owner display switch: render the Reposts section on the profile page. Applied in the view layer, not by RLS.';
comment on column public.profiles.show_replies is
  'Owner display switch: render the Replies section on the profile page. Applied in the view layer, not by RLS.';
comment on column public.profiles.show_likes is
  'Owner display switch: render the Likes section on the profile page. Applied in the view layer, not by RLS.';
