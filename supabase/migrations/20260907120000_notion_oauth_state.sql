-- OAuth state is server-side and deleted by one atomic operation, preventing
-- replay even when two callbacks race with the same signed state parameter.
create table public.notion_oauth_states (
  nonce text primary key check (length(nonce) between 20 and 256),
  owner_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index notion_oauth_states_expires_at_idx on public.notion_oauth_states (expires_at);

create or replace function public.consume_notion_oauth_state(p_nonce text, p_owner_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_consumed boolean;
begin
  delete from public.notion_oauth_states where expires_at <= now();
  delete from public.notion_oauth_states
    where nonce = p_nonce and owner_id = p_owner_id and expires_at > now()
    returning true into v_consumed;
  return coalesce(v_consumed, false);
end; $$;

revoke all on table public.notion_oauth_states from public, anon, authenticated;
revoke all on function public.consume_notion_oauth_state(text, uuid) from public, anon, authenticated;
grant execute on function public.consume_notion_oauth_state(text, uuid) to service_role;
