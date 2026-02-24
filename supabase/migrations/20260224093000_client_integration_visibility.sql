create table if not exists public.client_integration_visibility (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  company_id uuid,
  show_amazon boolean not null default true,
  show_profit_path boolean not null default true,
  show_arbitrage_one boolean not null default true,
  show_ups boolean not null default true,
  show_qogita boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.client_integration_visibility
  add column if not exists user_id uuid;
alter table if exists public.client_integration_visibility
  add column if not exists company_id uuid;
alter table if exists public.client_integration_visibility
  add column if not exists show_amazon boolean;
alter table if exists public.client_integration_visibility
  add column if not exists show_profit_path boolean;
alter table if exists public.client_integration_visibility
  add column if not exists show_arbitrage_one boolean;
alter table if exists public.client_integration_visibility
  add column if not exists show_ups boolean;
alter table if exists public.client_integration_visibility
  add column if not exists show_qogita boolean;
alter table if exists public.client_integration_visibility
  add column if not exists created_at timestamptz;
alter table if exists public.client_integration_visibility
  add column if not exists updated_at timestamptz;

alter table if exists public.client_integration_visibility
  alter column show_amazon set default true;
alter table if exists public.client_integration_visibility
  alter column show_profit_path set default true;
alter table if exists public.client_integration_visibility
  alter column show_arbitrage_one set default true;
alter table if exists public.client_integration_visibility
  alter column show_ups set default true;
alter table if exists public.client_integration_visibility
  alter column show_qogita set default true;
alter table if exists public.client_integration_visibility
  alter column created_at set default now();
alter table if exists public.client_integration_visibility
  alter column updated_at set default now();

create index if not exists idx_client_integration_visibility_company_id
  on public.client_integration_visibility (company_id);

create or replace function public.touch_client_integration_visibility_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists client_integration_visibility_updated_at on public.client_integration_visibility;
create trigger client_integration_visibility_updated_at
  before update on public.client_integration_visibility
  for each row execute procedure public.touch_client_integration_visibility_updated_at();

alter table public.client_integration_visibility enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'Admins can manage client integration visibility'
      and polrelid = 'public.client_integration_visibility'::regclass
  ) then
    create policy "Admins can manage client integration visibility"
      on public.client_integration_visibility
      as permissive
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'Users can read own client integration visibility'
      and polrelid = 'public.client_integration_visibility'::regclass
  ) then
    create policy "Users can read own client integration visibility"
      on public.client_integration_visibility
      as permissive
      for select
      to authenticated
      using (user_id = auth.uid() or company_id = public.current_company_id());
  end if;
end;
$$;
