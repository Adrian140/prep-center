create table if not exists public.prep_business_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  email_arbitrage_one text,
  email_prep_business text,
  status text not null default 'pending',
  merchant_id text,
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prep_business_integrations_user_id_key
  on public.prep_business_integrations (user_id);
create index if not exists idx_prep_business_integrations_company_id
  on public.prep_business_integrations (company_id);
create index if not exists idx_prep_business_integrations_email_ao
  on public.prep_business_integrations (email_arbitrage_one);
create index if not exists idx_prep_business_integrations_email_pb
  on public.prep_business_integrations (email_prep_business);
create index if not exists idx_prep_business_integrations_merchant_id
  on public.prep_business_integrations (merchant_id);

create or replace function public.touch_prep_business_integrations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists prep_business_integrations_updated_at on public.prep_business_integrations;
create trigger prep_business_integrations_updated_at
  before update on public.prep_business_integrations
  for each row execute procedure public.touch_prep_business_integrations_updated_at();

create table if not exists public.prep_business_imports (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  merchant_id text,
  user_id uuid,
  company_id uuid,
  receiving_shipment_id uuid,
  status text not null default 'imported',
  payload jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists prep_business_imports_source_id_key
  on public.prep_business_imports (source_id);
create index if not exists idx_prep_business_imports_company_id
  on public.prep_business_imports (company_id);
create index if not exists idx_prep_business_imports_merchant_id
  on public.prep_business_imports (merchant_id);

create table if not exists public.prep_merchants (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null,
  company_id uuid not null,
  user_id uuid,
  destination_country text,
  warehouse_country text,
  import_tags text[],
  sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prep_merchants_merchant_id_key
  on public.prep_merchants (merchant_id);
create index if not exists idx_prep_merchants_company_id
  on public.prep_merchants (company_id);

create or replace function public.touch_prep_merchants_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists prep_merchants_updated_at on public.prep_merchants;
create trigger prep_merchants_updated_at
  before update on public.prep_merchants
  for each row execute procedure public.touch_prep_merchants_updated_at();

alter table public.prep_business_integrations enable row level security;
alter table public.prep_business_imports enable row level security;
alter table public.prep_merchants enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'Admins can manage all prep business integrations'
      and polrelid = 'public.prep_business_integrations'::regclass
  ) then
    create policy "Admins can manage all prep business integrations"
      on public.prep_business_integrations
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
    where polname = 'Users can manage own prep business integrations'
      and polrelid = 'public.prep_business_integrations'::regclass
  ) then
    create policy "Users can manage own prep business integrations"
      on public.prep_business_integrations
      as permissive
      for all
      to authenticated
      using (user_id = auth.uid() or company_id = public.current_company_id())
      with check (user_id = auth.uid() or company_id = public.current_company_id());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'Admins can manage all prep business imports'
      and polrelid = 'public.prep_business_imports'::regclass
  ) then
    create policy "Admins can manage all prep business imports"
      on public.prep_business_imports
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
    where polname = 'Users can read prep business imports'
      and polrelid = 'public.prep_business_imports'::regclass
  ) then
    create policy "Users can read prep business imports"
      on public.prep_business_imports
      as permissive
      for select
      to authenticated
      using (company_id = public.current_company_id());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'Admins can manage prep merchants'
      and polrelid = 'public.prep_merchants'::regclass
  ) then
    create policy "Admins can manage prep merchants"
      on public.prep_merchants
      as permissive
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end;
$$;
