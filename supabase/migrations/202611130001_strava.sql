-- Tokens never have a browser-readable policy. Run once in the SQL Editor.
create table if not exists public.ativa_strava_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete_id bigint unique not null,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  last_sync timestamptz,
  sync_lock uuid,
  locked_until timestamptz
);
create table if not exists public.ativa_strava_oauth (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_hash text not null,
  expires_at timestamptz not null
);
create table if not exists public.ativa_strava_activities (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id bigint not null,
  activity jsonb not null,
  primary key (user_id, activity_id)
);
alter table public.ativa_strava_connections enable row level security;
alter table public.ativa_strava_oauth enable row level security;
alter table public.ativa_strava_activities enable row level security;
revoke all on public.ativa_strava_connections, public.ativa_strava_oauth, public.ativa_strava_activities from anon, authenticated;
grant all on public.ativa_strava_connections, public.ativa_strava_oauth, public.ativa_strava_activities to service_role;

-- Atomically replace a completed API scan; never publish a partial page set.
create or replace function public.ativa_replace_strava(p_user uuid, p_lock uuid, p_activities jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.ativa_strava_connections
    where user_id=p_user and sync_lock=p_lock and locked_until>now() for update;
  if not found then raise exception 'sync lease expired'; end if;
  delete from public.ativa_strava_activities where user_id=p_user;
  insert into public.ativa_strava_activities(user_id,activity_id,activity)
    select p_user,(item->>'stravaId')::bigint,item from jsonb_array_elements(p_activities) item;
  update public.ativa_strava_connections set last_sync=now(),sync_lock=null,locked_until=null where user_id=p_user;
end;
$$;
revoke all on function public.ativa_replace_strava(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ativa_replace_strava(uuid,uuid,jsonb) to service_role;
