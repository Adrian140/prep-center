create table if not exists public.fbm_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null references public.profiles(id) on delete set null,
  integration_id uuid null references public.amazon_integrations(id) on delete set null,
  marketplace_id text null,
  marketplace_country text null,
  amazon_order_id text not null,
  seller_order_id text null,
  amazon_order_status text null,
  local_status text not null default 'pending' check (local_status in ('pending', 'processing', 'ready', 'shipped', 'cancelled')),
  fulfillment_channel text null,
  sales_channel text null,
  shipment_service_level_category text null,
  order_total_amount numeric(12,2) null,
  order_total_currency text null,
  number_of_items_shipped integer not null default 0,
  number_of_items_unshipped integer not null default 0,
  purchase_date timestamptz null,
  latest_ship_date timestamptz null,
  latest_delivery_start_date timestamptz null,
  latest_delivery_end_date timestamptz null,
  buyer_email text null,
  buyer_name text null,
  buyer_phone text null,
  recipient_name text null,
  company_name text null,
  address_line_1 text null,
  address_line_2 text null,
  address_line_3 text null,
  city text null,
  state_or_region text null,
  postal_code text null,
  country_code text null,
  address_phone text null,
  tracking_number text null,
  carrier_code text null,
  carrier_name text null,
  shipping_method text null,
  package_reference_id integer null,
  shipped_at timestamptz null,
  amazon_confirmed_at timestamptz null,
  confirm_shipment_status text null,
  confirm_shipment_error text null,
  raw_order jsonb null default '{}'::jsonb,
  raw_address jsonb null default '{}'::jsonb,
  raw_buyer jsonb null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fbm_orders_company_amazon_order_unique unique (company_id, amazon_order_id)
);

create table if not exists public.fbm_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.fbm_orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_item_id bigint null references public.stock_items(id) on delete set null,
  amazon_order_item_id text not null,
  asin text null,
  sku text null,
  title text null,
  quantity_ordered integer not null default 0,
  quantity_shipped integer not null default 0,
  item_price_amount numeric(12,2) null,
  item_price_currency text null,
  item_tax_amount numeric(12,2) null,
  promotion_discount_amount numeric(12,2) null,
  shipping_price_amount numeric(12,2) null,
  shipping_tax_amount numeric(12,2) null,
  gift_wrap_price_amount numeric(12,2) null,
  gift_wrap_tax_amount numeric(12,2) null,
  item_condition text null,
  item_condition_subtype text null,
  raw_item jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fbm_order_items_order_item_unique unique (order_id, amazon_order_item_id)
);

create table if not exists public.fbm_order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.fbm_orders(id) on delete cascade,
  order_item_id uuid null references public.fbm_order_items(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  file_type text not null check (file_type in ('shipping_label', 'invoice', 'packing_slip', 'other')),
  file_name text null,
  storage_path text not null,
  mime_type text null,
  size_bytes bigint null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_fbm_orders_company_status
  on public.fbm_orders (company_id, local_status, purchase_date desc);

create index if not exists idx_fbm_orders_marketplace
  on public.fbm_orders (marketplace_id, amazon_order_status);

create index if not exists idx_fbm_order_items_order
  on public.fbm_order_items (order_id);

create index if not exists idx_fbm_order_items_stock
  on public.fbm_order_items (stock_item_id);

create index if not exists idx_fbm_order_files_order
  on public.fbm_order_files (order_id);

alter table public.fbm_orders enable row level security;
alter table public.fbm_order_items enable row level security;
alter table public.fbm_order_files enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'fbm_orders' and policyname = 'fbm_orders_company_select') then
    create policy "fbm_orders_company_select"
      on public.fbm_orders
      for select
      to authenticated
      using (
        company_id in (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
        or public.is_admin(auth.uid())
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'fbm_orders' and policyname = 'fbm_orders_company_write') then
    create policy "fbm_orders_company_write"
      on public.fbm_orders
      for all
      to authenticated
      using (
        company_id in (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
        or public.is_admin(auth.uid())
      )
      with check (
        company_id in (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
        or public.is_admin(auth.uid())
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'fbm_order_items' and policyname = 'fbm_order_items_company') then
    create policy "fbm_order_items_company"
      on public.fbm_order_items
      for all
      to authenticated
      using (
        order_id in (
          select o.id
          from public.fbm_orders o
          where o.company_id in (
            select p.company_id
            from public.profiles p
            where p.id = auth.uid()
          )
          or public.is_admin(auth.uid())
        )
      )
      with check (
        order_id in (
          select o.id
          from public.fbm_orders o
          where o.company_id in (
            select p.company_id
            from public.profiles p
            where p.id = auth.uid()
          )
          or public.is_admin(auth.uid())
        )
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'fbm_order_files' and policyname = 'fbm_order_files_company') then
    create policy "fbm_order_files_company"
      on public.fbm_order_files
      for all
      to authenticated
      using (
        order_id in (
          select o.id
          from public.fbm_orders o
          where o.company_id in (
            select p.company_id
            from public.profiles p
            where p.id = auth.uid()
          )
          or public.is_admin(auth.uid())
        )
      )
      with check (
        order_id in (
          select o.id
          from public.fbm_orders o
          where o.company_id in (
            select p.company_id
            from public.profiles p
            where p.id = auth.uid()
          )
          or public.is_admin(auth.uid())
        )
      );
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('fbm-order-files', 'fbm-order-files', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'fbm_order_files_select'
  ) then
    create policy "fbm_order_files_select"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'fbm-order-files'
        and (
          public.is_admin(auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and split_part(name, '/', 1) = p.company_id::text
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'fbm_order_files_insert'
  ) then
    create policy "fbm_order_files_insert"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'fbm-order-files'
        and (
          public.is_admin(auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and split_part(name, '/', 1) = p.company_id::text
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'fbm_order_files_update'
  ) then
    create policy "fbm_order_files_update"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'fbm-order-files'
        and (
          public.is_admin(auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and split_part(name, '/', 1) = p.company_id::text
          )
        )
      )
      with check (
        bucket_id = 'fbm-order-files'
        and (
          public.is_admin(auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and split_part(name, '/', 1) = p.company_id::text
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'fbm_order_files_delete'
  ) then
    create policy "fbm_order_files_delete"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'fbm-order-files'
        and (
          public.is_admin(auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and split_part(name, '/', 1) = p.company_id::text
          )
        )
      );
  end if;
end $$;
