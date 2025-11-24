alter table if exists public.amazon_integrations
  add column if not exists selling_partner_id text;

create index if not exists amazon_integrations_selling_partner_id_idx
  on public.amazon_integrations (selling_partner_id);

-- Ensure other columns expected by the app exist
alter table if exists public.amazon_integrations
  add column if not exists region text default 'eu',
  add column if not exists status text default 'active',
  add column if not exists refresh_token text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_error text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists amazon_integrations_user_marketplace_idx
  on public.amazon_integrations (user_id, marketplace_id);

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

alter table if exists public.amazon_integrations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'amazon_integrations'
      and policyname = 'Users can view own integrations'
  ) then
    create policy "Users can view own integrations"
      on public.amazon_integrations
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'amazon_integrations'
      and policyname = 'Users can manage own integrations'
  ) then
    create policy "Users can manage own integrations"
      on public.amazon_integrations
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'amazon_integrations'
      and policyname = 'Users can delete own integrations'
  ) then
    create policy "Users can delete own integrations"
      on public.amazon_integrations
      for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'amazon_integrations'
      and policyname = 'Users can update own integrations'
  ) then
    create policy "Users can update own integrations"
      on public.amazon_integrations
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end;
$$ language plpgsql;

-- Backfill company_id/status/region for rows inserted without them
update public.amazon_integrations ai
set company_id = coalesce(ai.company_id, p.company_id),
    region = coalesce(nullif(ai.region, ''), 'eu'),
    status = coalesce(nullif(ai.status, ''), 'active')
from public.profiles p
where ai.company_id is null
  and p.id = ai.user_id;
