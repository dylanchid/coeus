create or replace function public.guard_profile_handle_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- All client roles lack table UPDATE grants; the SECURITY DEFINER RPC runs
  -- as its owner and is the sole application path permitted to rename.
  if old.handle is distinct from new.handle and current_user <> 'postgres'
     and current_setting('app.allow_handle_change', true) is distinct from 'on' then
    raise exception 'Handle changes must use save_profile' using errcode = 'HCH01';
  end if;
  return new;
end; $$;
