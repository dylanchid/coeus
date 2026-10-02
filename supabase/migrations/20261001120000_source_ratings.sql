-- Community star ratings for directory sources. One row per (user, source);
-- the rating is stored in half-star steps (1 = ½ star … 10 = 5 stars) so the
-- histogram buckets are plain integers. source_id is a catalog source id; the
-- BFF validates it, so the table needs no foreign key.

create table public.source_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id text not null check (char_length(source_id) between 1 and 80),
  half_steps smallint not null check (half_steps between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, source_id)
);

create index source_ratings_source_idx on public.source_ratings (source_id, half_steps);

comment on table public.source_ratings is
  'One half-star-resolution rating per user per directory source. Written and aggregated only through the server-side sources ratings API.';

alter table public.source_ratings enable row level security;
revoke all on public.source_ratings from anon, authenticated;

-- Histogram buckets for one source. Aggregated in SQL so the API never ships
-- every rating row to the app server.
create or replace function public.source_rating_histogram(p_source_id text)
returns table (half_steps smallint, ratings bigint)
language sql
stable
set search_path = ''
as $$
  select half_steps, count(*)::bigint
  from public.source_ratings
  where source_id = p_source_id
  group by half_steps
  order by half_steps;
$$;

-- Default privileges already close new functions to client roles; make that
-- explicit and grant the server role.
revoke execute on function public.source_rating_histogram(text) from public, anon, authenticated;
grant execute on function public.source_rating_histogram(text) to service_role;
