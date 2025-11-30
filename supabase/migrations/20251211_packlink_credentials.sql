-- Per-user Packlink API keys (optional, fallback to global key)
create extension if not exists "pgcrypto";

create table if not exists public.packlink_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_packlink_credentials_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists packlink_credentials_set_updated_at on public.packlink_credentials;
create trigger packlink_credentials_set_updated_at
before update on public.packlink_credentials
for each row execute function public.set_packlink_credentials_updated_at();

alter table public.packlink_credentials enable row level security;

create policy "packlink_credentials_select_own"
  on public.packlink_credentials
  for select
  using (auth.uid() = user_id);

create policy "packlink_credentials_upsert_own"
  on public.packlink_credentials
  for insert
  with check (auth.uid() = user_id);

create policy "packlink_credentials_update_own"
  on public.packlink_credentials
  for update
  using (auth.uid() = user_id);

create policy "packlink_credentials_service_role_all"
  on public.packlink_credentials
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
