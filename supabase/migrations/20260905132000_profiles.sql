-- Public identity for a signed-in user. A profile is created explicitly by the
-- onboarding step (/welcome), never by a trigger on auth.users: the *absence* of
-- a row is exactly the "this account still needs to pick a handle" state the app
-- gates on. Handles are stored already-lowercased (the app validates against
-- ^[a-z0-9_]{3,20}$ before writing) so a plain unique constraint is
-- case-insensitive without needing the citext extension.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text check (bio is null or char_length(bio) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Profiles are public identity: anyone (including anonymous readers of a
-- published /c/<slug> collection) may read them. Writes are restricted to the
-- owner, and the id can never be reassigned to another account.
create policy "profiles are publicly readable" on public.profiles for select
  using (true);
create policy "owners create their own profile" on public.profiles for insert
  with check (id = (select auth.uid()));
create policy "owners update their own profile" on public.profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

comment on table public.profiles is
  'Public identity for a signed-in account. Created by onboarding, not by an auth.users trigger; a missing row means the account has not completed onboarding.';
comment on column public.profiles.handle is
  'Lowercased, url-safe public username. The app validates ^[a-z0-9_]{3,20}$ before every write.';
