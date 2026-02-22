create table if not exists public.ups_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  status text not null default 'pending',
  ups_account_number text,
  account_label text,
  oauth_scope text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.ups_integrations
  add column if not exists user_id uuid;
alter table if exists public.ups_integrations
  add column if not exists company_id uuid;
alter table if exists public.ups_integrations
  add column if not exists status text;
alter table if exists public.ups_integrations
  add column if not exists ups_account_number text;
alter table if exists public.ups_integrations
  add column if not exists account_label text;
alter table if exists public.ups_integrations
  add column if not exists oauth_scope text;
alter table if exists public.ups_integrations
  add column if not exists connected_at timestamptz;
alter table if exists public.ups_integrations
  add column if not exists last_synced_at timestamptz;
alter table if exists public.ups_integrations
  add column if not exists last_error text;
alter table if exists public.ups_integrations
  add column if not exists metadata jsonb;
alter table if exists public.ups_integrations
  add column if not exists created_at timestamptz;
alter table if exists public.ups_integrations
  add column if not exists updated_at timestamptz;

alter table if exists public.ups_integrations
  alter column status set default 'pending';
alter table if exists public.ups_integrations
  alter column metadata set default '{}'::jsonb;
alter table if exists public.ups_integrations
  alter column created_at set default now();
alter table if exists public.ups_integrations
  alter column updated_at set default now();

create unique index if not exists ups_integrations_user_id_key
  on public.ups_integrations(user_id);
create index if not exists idx_ups_integrations_company_id
  on public.ups_integrations(company_id);
create index if not exists idx_ups_integrations_status
  on public.ups_integrations(status);

create table if not exists public.ups_shipping_orders (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.ups_integrations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  external_order_id text,
  status text not null default 'draft',
  service_code text,
  packaging_type text,
  payment_type text not null default 'BillShipper',
  currency text,
  total_charge numeric(12,2),
  tracking_number text,
  label_file_path text,
  label_format text,
  ship_from jsonb not null default '{}'::jsonb,
  ship_to jsonb not null default '{}'::jsonb,
  package_data jsonb not null default '{}'::jsonb,
  request_payload jsonb,
  response_payload jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.ups_shipping_orders
  add column if not exists integration_id uuid;
alter table if exists public.ups_shipping_orders
  add column if not exists user_id uuid;
alter table if exists public.ups_shipping_orders
  add column if not exists company_id uuid;
alter table if exists public.ups_shipping_orders
  add column if not exists external_order_id text;
alter table if exists public.ups_shipping_orders
  add column if not exists status text;
alter table if exists public.ups_shipping_orders
  add column if not exists service_code text;
alter table if exists public.ups_shipping_orders
  add column if not exists packaging_type text;
alter table if exists public.ups_shipping_orders
  add column if not exists payment_type text;
alter table if exists public.ups_shipping_orders
  add column if not exists currency text;
alter table if exists public.ups_shipping_orders
  add column if not exists total_charge numeric(12,2);
alter table if exists public.ups_shipping_orders
  add column if not exists tracking_number text;
alter table if exists public.ups_shipping_orders
  add column if not exists label_file_path text;
alter table if exists public.ups_shipping_orders
  add column if not exists label_format text;
alter table if exists public.ups_shipping_orders
  add column if not exists ship_from jsonb;
alter table if exists public.ups_shipping_orders
  add column if not exists ship_to jsonb;
alter table if exists public.ups_shipping_orders
  add column if not exists package_data jsonb;
alter table if exists public.ups_shipping_orders
  add column if not exists request_payload jsonb;
alter table if exists public.ups_shipping_orders
  add column if not exists response_payload jsonb;
alter table if exists public.ups_shipping_orders
  add column if not exists last_error text;
alter table if exists public.ups_shipping_orders
  add column if not exists created_at timestamptz;
alter table if exists public.ups_shipping_orders
  add column if not exists updated_at timestamptz;

alter table if exists public.ups_shipping_orders
  alter column status set default 'draft';
alter table if exists public.ups_shipping_orders
  alter column payment_type set default 'BillShipper';
alter table if exists public.ups_shipping_orders
  alter column ship_from set default '{}'::jsonb;
alter table if exists public.ups_shipping_orders
  alter column ship_to set default '{}'::jsonb;
alter table if exists public.ups_shipping_orders
  alter column package_data set default '{}'::jsonb;
alter table if exists public.ups_shipping_orders
  alter column created_at set default now();
alter table if exists public.ups_shipping_orders
  alter column updated_at set default now();

create index if not exists idx_ups_shipping_orders_company_id
  on public.ups_shipping_orders(company_id);
create index if not exists idx_ups_shipping_orders_user_id
  on public.ups_shipping_orders(user_id);
create index if not exists idx_ups_shipping_orders_integration_id
  on public.ups_shipping_orders(integration_id);
create index if not exists idx_ups_shipping_orders_external_order_id
  on public.ups_shipping_orders(external_order_id);
create index if not exists idx_ups_shipping_orders_status
  on public.ups_shipping_orders(status);

create table if not exists public.ups_invoice_files (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.ups_integrations(id) on delete cascade,
  order_id uuid null references public.ups_shipping_orders(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  invoice_number text,
  invoice_date date,
  currency text,
  amount_total numeric(12,2),
  file_path text,
  file_name text,
  source text not null default 'manual',
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.ups_invoice_files
  add column if not exists integration_id uuid;
alter table if exists public.ups_invoice_files
  add column if not exists order_id uuid;
alter table if exists public.ups_invoice_files
  add column if not exists user_id uuid;
alter table if exists public.ups_invoice_files
  add column if not exists company_id uuid;
alter table if exists public.ups_invoice_files
  add column if not exists invoice_number text;
alter table if exists public.ups_invoice_files
  add column if not exists invoice_date date;
alter table if exists public.ups_invoice_files
  add column if not exists currency text;
alter table if exists public.ups_invoice_files
  add column if not exists amount_total numeric(12,2);
alter table if exists public.ups_invoice_files
  add column if not exists file_path text;
alter table if exists public.ups_invoice_files
  add column if not exists file_name text;
alter table if exists public.ups_invoice_files
  add column if not exists source text;
alter table if exists public.ups_invoice_files
  add column if not exists status text;
alter table if exists public.ups_invoice_files
  add column if not exists payload jsonb;
alter table if exists public.ups_invoice_files
  add column if not exists created_at timestamptz;
alter table if exists public.ups_invoice_files
  add column if not exists updated_at timestamptz;

alter table if exists public.ups_invoice_files
  alter column source set default 'manual';
alter table if exists public.ups_invoice_files
  alter column status set default 'received';
alter table if exists public.ups_invoice_files
  alter column payload set default '{}'::jsonb;
alter table if exists public.ups_invoice_files
  alter column created_at set default now();
alter table if exists public.ups_invoice_files
  alter column updated_at set default now();

create index if not exists idx_ups_invoice_files_company_id
  on public.ups_invoice_files(company_id);
create index if not exists idx_ups_invoice_files_user_id
  on public.ups_invoice_files(user_id);
create index if not exists idx_ups_invoice_files_order_id
  on public.ups_invoice_files(order_id);
create index if not exists idx_ups_invoice_files_invoice_date
  on public.ups_invoice_files(invoice_date);

create table if not exists public.ups_postal_codes (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  postal_code text not null,
  city text,
  state_code text,
  is_serviceable boolean not null default true,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.ups_postal_codes
  add column if not exists country_code text;
alter table if exists public.ups_postal_codes
  add column if not exists postal_code text;
alter table if exists public.ups_postal_codes
  add column if not exists city text;
alter table if exists public.ups_postal_codes
  add column if not exists state_code text;
alter table if exists public.ups_postal_codes
  add column if not exists is_serviceable boolean;
alter table if exists public.ups_postal_codes
  add column if not exists source text;
alter table if exists public.ups_postal_codes
  add column if not exists created_at timestamptz;
alter table if exists public.ups_postal_codes
  add column if not exists updated_at timestamptz;

alter table if exists public.ups_postal_codes
  alter column is_serviceable set default true;
alter table if exists public.ups_postal_codes
  alter column source set default 'manual';
alter table if exists public.ups_postal_codes
  alter column created_at set default now();
alter table if exists public.ups_postal_codes
  alter column updated_at set default now();

create unique index if not exists ups_postal_codes_country_postal_key
  on public.ups_postal_codes(country_code, postal_code);
create index if not exists idx_ups_postal_codes_country
  on public.ups_postal_codes(country_code);

create or replace function public.touch_ups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_ups_postal_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.country_code = upper(coalesce(new.country_code, ''));
  new.postal_code = trim(coalesce(new.postal_code, ''));
  return new;
end;
$$;

drop trigger if exists ups_integrations_touch_updated_at on public.ups_integrations;
create trigger ups_integrations_touch_updated_at
before update on public.ups_integrations
for each row execute procedure public.touch_ups_updated_at();

drop trigger if exists ups_shipping_orders_touch_updated_at on public.ups_shipping_orders;
create trigger ups_shipping_orders_touch_updated_at
before update on public.ups_shipping_orders
for each row execute procedure public.touch_ups_updated_at();

drop trigger if exists ups_invoice_files_touch_updated_at on public.ups_invoice_files;
create trigger ups_invoice_files_touch_updated_at
before update on public.ups_invoice_files
for each row execute procedure public.touch_ups_updated_at();

drop trigger if exists ups_postal_codes_touch_updated_at on public.ups_postal_codes;
create trigger ups_postal_codes_touch_updated_at
before insert or update on public.ups_postal_codes
for each row execute procedure public.touch_ups_postal_codes_updated_at();

alter table public.ups_integrations enable row level security;
alter table public.ups_shipping_orders enable row level security;
alter table public.ups_invoice_files enable row level security;
alter table public.ups_postal_codes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'admins manage ups integrations'
      and polrelid = 'public.ups_integrations'::regclass
  ) then
    create policy "admins manage ups integrations"
      on public.ups_integrations
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
    where polname = 'users manage own ups integrations'
      and polrelid = 'public.ups_integrations'::regclass
  ) then
    create policy "users manage own ups integrations"
      on public.ups_integrations
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
    where polname = 'admins manage ups shipping orders'
      and polrelid = 'public.ups_shipping_orders'::regclass
  ) then
    create policy "admins manage ups shipping orders"
      on public.ups_shipping_orders
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
    where polname = 'users manage own ups shipping orders'
      and polrelid = 'public.ups_shipping_orders'::regclass
  ) then
    create policy "users manage own ups shipping orders"
      on public.ups_shipping_orders
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
    where polname = 'admins manage ups invoice files'
      and polrelid = 'public.ups_invoice_files'::regclass
  ) then
    create policy "admins manage ups invoice files"
      on public.ups_invoice_files
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
    where polname = 'users manage own ups invoice files'
      and polrelid = 'public.ups_invoice_files'::regclass
  ) then
    create policy "users manage own ups invoice files"
      on public.ups_invoice_files
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
    where polname = 'authenticated read ups postal codes'
      and polrelid = 'public.ups_postal_codes'::regclass
  ) then
    create policy "authenticated read ups postal codes"
      on public.ups_postal_codes
      for select
      to authenticated
      using (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'admins manage ups postal codes'
      and polrelid = 'public.ups_postal_codes'::regclass
  ) then
    create policy "admins manage ups postal codes"
      on public.ups_postal_codes
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('ups-documents', 'ups-documents', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'ups documents select'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "ups documents select"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'ups-documents'
        and (
          public.is_admin()
          or split_part(name, '/', 1) = coalesce(public.current_company_id()::text, '')
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'ups documents insert'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "ups documents insert"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'ups-documents'
        and (
          public.is_admin()
          or split_part(name, '/', 1) = coalesce(public.current_company_id()::text, '')
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'ups documents update'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "ups documents update"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'ups-documents'
        and (
          public.is_admin()
          or split_part(name, '/', 1) = coalesce(public.current_company_id()::text, '')
        )
      )
      with check (
        bucket_id = 'ups-documents'
        and (
          public.is_admin()
          or split_part(name, '/', 1) = coalesce(public.current_company_id()::text, '')
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'ups documents delete'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "ups documents delete"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'ups-documents'
        and (
          public.is_admin()
          or split_part(name, '/', 1) = coalesce(public.current_company_id()::text, '')
        )
      );
  end if;
end;
$$;

alter function public.touch_ups_updated_at() set search_path = public;
alter function public.touch_ups_postal_codes_updated_at() set search_path = public;
