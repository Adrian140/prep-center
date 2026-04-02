create table if not exists public.ups_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.ups_integrations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  warehouse_country text not null default 'FR',
  status text not null default 'draft',
  reference_number text,
  prn text,
  service_code text,
  destination_country_code text,
  container_code text,
  package_count integer not null default 1,
  total_weight numeric(12,3) not null default 0,
  weight_unit text not null default 'KGS',
  pickup_date date,
  ready_time text,
  close_time text,
  total_charge numeric(12,2),
  currency text,
  pickup_address jsonb not null default '{}'::jsonb,
  request_payload jsonb,
  response_payload jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.ups_pickup_requests
  add column if not exists integration_id uuid;
alter table if exists public.ups_pickup_requests
  add column if not exists user_id uuid;
alter table if exists public.ups_pickup_requests
  add column if not exists company_id uuid;
alter table if exists public.ups_pickup_requests
  add column if not exists warehouse_country text;
alter table if exists public.ups_pickup_requests
  add column if not exists status text;
alter table if exists public.ups_pickup_requests
  add column if not exists reference_number text;
alter table if exists public.ups_pickup_requests
  add column if not exists prn text;
alter table if exists public.ups_pickup_requests
  add column if not exists service_code text;
alter table if exists public.ups_pickup_requests
  add column if not exists destination_country_code text;
alter table if exists public.ups_pickup_requests
  add column if not exists container_code text;
alter table if exists public.ups_pickup_requests
  add column if not exists package_count integer;
alter table if exists public.ups_pickup_requests
  add column if not exists total_weight numeric(12,3);
alter table if exists public.ups_pickup_requests
  add column if not exists weight_unit text;
alter table if exists public.ups_pickup_requests
  add column if not exists pickup_date date;
alter table if exists public.ups_pickup_requests
  add column if not exists ready_time text;
alter table if exists public.ups_pickup_requests
  add column if not exists close_time text;
alter table if exists public.ups_pickup_requests
  add column if not exists total_charge numeric(12,2);
alter table if exists public.ups_pickup_requests
  add column if not exists currency text;
alter table if exists public.ups_pickup_requests
  add column if not exists pickup_address jsonb;
alter table if exists public.ups_pickup_requests
  add column if not exists request_payload jsonb;
alter table if exists public.ups_pickup_requests
  add column if not exists response_payload jsonb;
alter table if exists public.ups_pickup_requests
  add column if not exists last_error text;
alter table if exists public.ups_pickup_requests
  add column if not exists created_at timestamptz;
alter table if exists public.ups_pickup_requests
  add column if not exists updated_at timestamptz;

alter table if exists public.ups_pickup_requests
  alter column warehouse_country set default 'FR';
alter table if exists public.ups_pickup_requests
  alter column status set default 'draft';
alter table if exists public.ups_pickup_requests
  alter column package_count set default 1;
alter table if exists public.ups_pickup_requests
  alter column total_weight set default 0;
alter table if exists public.ups_pickup_requests
  alter column weight_unit set default 'KGS';
alter table if exists public.ups_pickup_requests
  alter column pickup_address set default '{}'::jsonb;
alter table if exists public.ups_pickup_requests
  alter column created_at set default now();
alter table if exists public.ups_pickup_requests
  alter column updated_at set default now();

create index if not exists idx_ups_pickup_requests_company_id
  on public.ups_pickup_requests(company_id);
create index if not exists idx_ups_pickup_requests_user_id
  on public.ups_pickup_requests(user_id);
create index if not exists idx_ups_pickup_requests_integration_id
  on public.ups_pickup_requests(integration_id);
create index if not exists idx_ups_pickup_requests_status
  on public.ups_pickup_requests(status);
create index if not exists idx_ups_pickup_requests_pickup_date
  on public.ups_pickup_requests(pickup_date desc, created_at desc);

alter table public.ups_pickup_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ups_pickup_requests'
      and policyname = 'admins manage ups pickup requests'
  ) then
    create policy "admins manage ups pickup requests"
      on public.ups_pickup_requests
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.is_admin = true
            and coalesce(p.is_limited_admin, false) = false
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.is_admin = true
            and coalesce(p.is_limited_admin, false) = false
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ups_pickup_requests'
      and policyname = 'users manage own ups pickup requests'
  ) then
    create policy "users manage own ups pickup requests"
      on public.ups_pickup_requests
      for all
      to authenticated
      using (
        auth.uid() = user_id
        or (
          company_id is not null
          and exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.company_id = ups_pickup_requests.company_id
          )
        )
      )
      with check (
        auth.uid() = user_id
        or (
          company_id is not null
          and exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.company_id = ups_pickup_requests.company_id
          )
        )
      );
  end if;
end $$;
