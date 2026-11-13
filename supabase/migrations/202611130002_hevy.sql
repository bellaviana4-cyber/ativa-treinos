create table if not exists public.ativa_hevy_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text not null,
  activities jsonb not null default '[]'::jsonb,
  last_sync timestamptz,
  sync_lock uuid,
  locked_until timestamptz
);
alter table public.ativa_hevy_connections enable row level security;
revoke all on public.ativa_hevy_connections from anon, authenticated;
grant all on public.ativa_hevy_connections to service_role;
