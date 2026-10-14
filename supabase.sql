-- Execute no SQL Editor de um projeto Supabase seu.
create table if not exists public.ativa_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);
alter table public.ativa_snapshots enable row level security;
create policy "ativa select own" on public.ativa_snapshots for select to authenticated using (auth.uid() = user_id);
create policy "ativa insert own" on public.ativa_snapshots for insert to authenticated with check (auth.uid() = user_id);
create policy "ativa update own" on public.ativa_snapshots for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
