-- Supabase schema for MLB favorites persistence
-- Run this in the Supabase SQL editor for the project used by the app and baseball server.

create table if not exists public.mlb_fav (
  user_id text primary key,
  subscriber_id text not null,
  push_token text null,
  platform text not null default 'unknown',
  favorite_team_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.update_mlb_fav_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_mlb_fav_updated_at on public.mlb_fav;
create trigger trg_update_mlb_fav_updated_at
before update on public.mlb_fav
for each row
execute function public.update_mlb_fav_updated_at();

alter table public.mlb_fav enable row level security;

drop policy if exists "mlb_fav_select_own" on public.mlb_fav;
create policy "mlb_fav_select_own"
  on public.mlb_fav
  for select
  to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists "mlb_fav_insert_own" on public.mlb_fav;
create policy "mlb_fav_insert_own"
  on public.mlb_fav
  for insert
  to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists "mlb_fav_update_own" on public.mlb_fav;
create policy "mlb_fav_update_own"
  on public.mlb_fav
  for update
  to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "mlb_fav_delete_own" on public.mlb_fav;
create policy "mlb_fav_delete_own"
  on public.mlb_fav
  for delete
  to authenticated
  using (auth.uid()::text = user_id);

create index if not exists idx_mlb_fav_subscriber_id on public.mlb_fav (subscriber_id);
create index if not exists idx_mlb_fav_updated_at on public.mlb_fav (updated_at desc);
