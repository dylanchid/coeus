-- Keep profile saves, handle history, quarantine and the rolling limit in one
-- transaction. The row lock serializes competing saves for one account.
create or replace function public.guard_profile_handle_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.handle is distinct from new.handle
     and current_user <> 'postgres'
     and current_setting('app.allow_handle_change', true) is distinct from 'on' then
    raise exception 'Handle changes must use save_profile' using errcode = 'HCH01';
  end if;
  return new;
end; $$;
drop trigger if exists profiles_guard_handle on public.profiles;
create trigger profiles_guard_handle before update on public.profiles
for each row execute function public.guard_profile_handle_update();

create or replace function public.save_profile(
  p_id uuid, p_handle text, p_display_name text, p_bio text, p_location text,
  p_links jsonb, p_avatar_url text, p_cover_url text, p_pinned_collection_slugs text[]
) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare v_old text; v_oldest timestamptz; v_count integer; v_row public.profiles;
begin
  select handle into v_old from public.profiles where id = p_id for update;
  if not found then
    insert into public.profiles (id,handle,display_name,bio,location,links,avatar_url,cover_url,pinned_collection_slugs)
    values (p_id,p_handle,p_display_name,p_bio,p_location,p_links,p_avatar_url,p_cover_url,p_pinned_collection_slugs)
    returning * into v_row;
    return v_row;
  end if;
  if v_old <> p_handle then
    select count(*), min(released_at) into v_count,v_oldest from public.handle_history
      where profile_id=p_id and released_at >= now() - interval '365 days';
    if v_count >= 3 then raise exception 'Handle change rate limited until %', v_oldest + interval '365 days' using errcode='HCR01'; end if;
    if not public.handle_available(p_handle,p_id) then
      if exists(select 1 from public.profiles where handle=p_handle) then raise exception 'Handle % is taken',p_handle using errcode='23505';
      else raise exception 'Handle % is quarantined',p_handle using errcode='HQ001'; end if;
    end if;
    insert into public.handle_history(old_handle,profile_id,released_at) values(v_old,p_id,now())
      on conflict(old_handle) do update set profile_id=excluded.profile_id,released_at=excluded.released_at;
    delete from public.handle_history where old_handle=p_handle;
    perform set_config('app.allow_handle_change','on',true);
  end if;
  update public.profiles set handle=p_handle,display_name=p_display_name,bio=p_bio,location=p_location,links=p_links,
    avatar_url=p_avatar_url,cover_url=p_cover_url,pinned_collection_slugs=p_pinned_collection_slugs where id=p_id returning * into v_row;
  return v_row;
end; $$;
revoke all on function public.save_profile(uuid,text,text,text,text,jsonb,text,text,text[]) from public,anon,authenticated;
grant execute on function public.save_profile(uuid,text,text,text,text,jsonb,text,text,text[]) to service_role;
