/*
  # Amazon Integrations table

  Stores Amazon SP-API refresh tokens per client so inventory sync can run automatically.
  - One row per (user_id, marketplace_id)
  - Tracks region, status, sync metadata
  - RLS allows clients to manage their own connections
*/

create table if not exists public.amazon_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  marketplace_id text not null,
  region text not null default 'eu',
  refresh_token text not null,
  selling_partner_id text,
  status text not null default 'active',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists amazon_integrations_user_marketplace_idx
  on public.amazon_integrations(user_id, marketplace_id);

alter table public.amazon_integrations enable row level security;

create policy "Users can view own integrations"
  on public.amazon_integrations
  for select
  using (auth.uid() = user_id);

create policy "Users can manage own integrations"
  on public.amazon_integrations
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own integrations"
  on public.amazon_integrations
  for delete
  using (auth.uid() = user_id);

create or replace function public.handle_amazon_integrations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists amazon_integrations_updated_at on public.amazon_integrations;
create trigger amazon_integrations_updated_at
  before update on public.amazon_integrations
  for each row execute procedure public.handle_amazon_integrations_updated_at();
