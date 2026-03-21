create table if not exists public.etsy_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  status text not null default 'pending',
  shop_id text,
  shop_name text,
  shop_url text,
  etsy_user_id text,
  access_scopes text[] not null default '{}'::text[],
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.etsy_integrations add column if not exists user_id uuid;
alter table if exists public.etsy_integrations add column if not exists company_id uuid;
alter table if exists public.etsy_integrations add column if not exists status text;
alter table if exists public.etsy_integrations add column if not exists shop_id text;
alter table if exists public.etsy_integrations add column if not exists shop_name text;
alter table if exists public.etsy_integrations add column if not exists shop_url text;
alter table if exists public.etsy_integrations add column if not exists etsy_user_id text;
alter table if exists public.etsy_integrations add column if not exists access_scopes text[];
alter table if exists public.etsy_integrations add column if not exists connected_at timestamptz;
alter table if exists public.etsy_integrations add column if not exists last_synced_at timestamptz;
alter table if exists public.etsy_integrations add column if not exists last_error text;
alter table if exists public.etsy_integrations add column if not exists metadata jsonb;
alter table if exists public.etsy_integrations add column if not exists created_at timestamptz;
alter table if exists public.etsy_integrations add column if not exists updated_at timestamptz;

alter table if exists public.etsy_integrations alter column status set default 'pending';
alter table if exists public.etsy_integrations alter column access_scopes set default '{}'::text[];
alter table if exists public.etsy_integrations alter column metadata set default '{}'::jsonb;
alter table if exists public.etsy_integrations alter column created_at set default now();
alter table if exists public.etsy_integrations alter column updated_at set default now();

create unique index if not exists etsy_integrations_user_id_key
  on public.etsy_integrations(user_id);
create index if not exists idx_etsy_integrations_company_id
  on public.etsy_integrations(company_id);
create index if not exists idx_etsy_integrations_status
  on public.etsy_integrations(status);
create index if not exists idx_etsy_integrations_shop_id
  on public.etsy_integrations(shop_id);

create table if not exists public.etsy_orders (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.etsy_integrations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  receipt_id bigint not null,
  shop_id text,
  shop_name text,
  status text,
  status_label text,
  tracking_code text,
  tracking_url text,
  tracking_status text,
  tracking_status_label text,
  carrier_name text,
  buyer_name text,
  buyer_email text,
  recipient_name text,
  currency_code text,
  subtotal_amount numeric(12,2),
  shipping_amount numeric(12,2),
  tax_amount numeric(12,2),
  discount_amount numeric(12,2),
  grandtotal_amount numeric(12,2),
  order_created_at timestamptz,
  shipped_at timestamptz,
  last_tracking_sync_at timestamptz,
  last_synced_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.etsy_orders add column if not exists integration_id uuid;
alter table if exists public.etsy_orders add column if not exists user_id uuid;
alter table if exists public.etsy_orders add column if not exists company_id uuid;
alter table if exists public.etsy_orders add column if not exists receipt_id bigint;
alter table if exists public.etsy_orders add column if not exists shop_id text;
alter table if exists public.etsy_orders add column if not exists shop_name text;
alter table if exists public.etsy_orders add column if not exists status text;
alter table if exists public.etsy_orders add column if not exists status_label text;
alter table if exists public.etsy_orders add column if not exists tracking_code text;
alter table if exists public.etsy_orders add column if not exists tracking_url text;
alter table if exists public.etsy_orders add column if not exists tracking_status text;
alter table if exists public.etsy_orders add column if not exists tracking_status_label text;
alter table if exists public.etsy_orders add column if not exists carrier_name text;
alter table if exists public.etsy_orders add column if not exists buyer_name text;
alter table if exists public.etsy_orders add column if not exists buyer_email text;
alter table if exists public.etsy_orders add column if not exists recipient_name text;
alter table if exists public.etsy_orders add column if not exists currency_code text;
alter table if exists public.etsy_orders add column if not exists subtotal_amount numeric(12,2);
alter table if exists public.etsy_orders add column if not exists shipping_amount numeric(12,2);
alter table if exists public.etsy_orders add column if not exists tax_amount numeric(12,2);
alter table if exists public.etsy_orders add column if not exists discount_amount numeric(12,2);
alter table if exists public.etsy_orders add column if not exists grandtotal_amount numeric(12,2);
alter table if exists public.etsy_orders add column if not exists order_created_at timestamptz;
alter table if exists public.etsy_orders add column if not exists shipped_at timestamptz;
alter table if exists public.etsy_orders add column if not exists last_tracking_sync_at timestamptz;
alter table if exists public.etsy_orders add column if not exists last_synced_at timestamptz;
alter table if exists public.etsy_orders add column if not exists raw_payload jsonb;
alter table if exists public.etsy_orders add column if not exists created_at timestamptz;
alter table if exists public.etsy_orders add column if not exists updated_at timestamptz;

alter table if exists public.etsy_orders alter column raw_payload set default '{}'::jsonb;
alter table if exists public.etsy_orders alter column created_at set default now();
alter table if exists public.etsy_orders alter column updated_at set default now();

create unique index if not exists etsy_orders_receipt_id_key
  on public.etsy_orders(receipt_id);
create index if not exists idx_etsy_orders_company_id
  on public.etsy_orders(company_id);
create index if not exists idx_etsy_orders_user_id
  on public.etsy_orders(user_id);
create index if not exists idx_etsy_orders_integration_id
  on public.etsy_orders(integration_id);
create index if not exists idx_etsy_orders_tracking_code
  on public.etsy_orders(tracking_code);
create index if not exists idx_etsy_orders_order_created_at
  on public.etsy_orders(order_created_at desc);

create table if not exists public.etsy_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.etsy_orders(id) on delete cascade,
  integration_id uuid not null references public.etsy_integrations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  stock_item_id bigint null references public.stock_items(id) on delete set null,
  receipt_id bigint not null,
  listing_id bigint,
  product_id bigint,
  offering_id bigint,
  sku text,
  title text,
  variation text,
  quantity integer not null default 0,
  unit_price_amount numeric(12,2),
  line_total_amount numeric(12,2),
  currency_code text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.etsy_order_items add column if not exists order_id uuid;
alter table if exists public.etsy_order_items add column if not exists integration_id uuid;
alter table if exists public.etsy_order_items add column if not exists user_id uuid;
alter table if exists public.etsy_order_items add column if not exists company_id uuid;
alter table if exists public.etsy_order_items add column if not exists stock_item_id bigint;
alter table if exists public.etsy_order_items add column if not exists receipt_id bigint;
alter table if exists public.etsy_order_items add column if not exists listing_id bigint;
alter table if exists public.etsy_order_items add column if not exists product_id bigint;
alter table if exists public.etsy_order_items add column if not exists offering_id bigint;
alter table if exists public.etsy_order_items add column if not exists sku text;
alter table if exists public.etsy_order_items add column if not exists title text;
alter table if exists public.etsy_order_items add column if not exists variation text;
alter table if exists public.etsy_order_items add column if not exists quantity integer;
alter table if exists public.etsy_order_items add column if not exists unit_price_amount numeric(12,2);
alter table if exists public.etsy_order_items add column if not exists line_total_amount numeric(12,2);
alter table if exists public.etsy_order_items add column if not exists currency_code text;
alter table if exists public.etsy_order_items add column if not exists raw_payload jsonb;
alter table if exists public.etsy_order_items add column if not exists created_at timestamptz;
alter table if exists public.etsy_order_items add column if not exists updated_at timestamptz;

alter table if exists public.etsy_order_items alter column quantity set default 0;
alter table if exists public.etsy_order_items
  alter column stock_item_id type bigint
  using case when stock_item_id is null then null else stock_item_id::bigint end;
alter table if exists public.etsy_order_items alter column raw_payload set default '{}'::jsonb;
alter table if exists public.etsy_order_items alter column created_at set default now();
alter table if exists public.etsy_order_items alter column updated_at set default now();

create index if not exists idx_etsy_order_items_order_id
  on public.etsy_order_items(order_id);
create index if not exists idx_etsy_order_items_company_id
  on public.etsy_order_items(company_id);
create index if not exists idx_etsy_order_items_stock_item_id
  on public.etsy_order_items(stock_item_id);
create index if not exists idx_etsy_order_items_sku
  on public.etsy_order_items(sku);

create table if not exists public.etsy_tracking_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.etsy_orders(id) on delete cascade,
  integration_id uuid not null references public.etsy_integrations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  receipt_id bigint not null,
  tracking_code text,
  carrier_name text,
  status text,
  status_label text,
  status_detail text,
  location text,
  event_time timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.etsy_tracking_events add column if not exists order_id uuid;
alter table if exists public.etsy_tracking_events add column if not exists integration_id uuid;
alter table if exists public.etsy_tracking_events add column if not exists user_id uuid;
alter table if exists public.etsy_tracking_events add column if not exists company_id uuid;
alter table if exists public.etsy_tracking_events add column if not exists receipt_id bigint;
alter table if exists public.etsy_tracking_events add column if not exists tracking_code text;
alter table if exists public.etsy_tracking_events add column if not exists carrier_name text;
alter table if exists public.etsy_tracking_events add column if not exists status text;
alter table if exists public.etsy_tracking_events add column if not exists status_label text;
alter table if exists public.etsy_tracking_events add column if not exists status_detail text;
alter table if exists public.etsy_tracking_events add column if not exists location text;
alter table if exists public.etsy_tracking_events add column if not exists event_time timestamptz;
alter table if exists public.etsy_tracking_events add column if not exists raw_payload jsonb;
alter table if exists public.etsy_tracking_events add column if not exists created_at timestamptz;
alter table if exists public.etsy_tracking_events add column if not exists updated_at timestamptz;

alter table if exists public.etsy_tracking_events alter column raw_payload set default '{}'::jsonb;
alter table if exists public.etsy_tracking_events alter column created_at set default now();
alter table if exists public.etsy_tracking_events alter column updated_at set default now();

create index if not exists idx_etsy_tracking_events_order_id
  on public.etsy_tracking_events(order_id);
create index if not exists idx_etsy_tracking_events_company_id
  on public.etsy_tracking_events(company_id);
create index if not exists idx_etsy_tracking_events_tracking_code
  on public.etsy_tracking_events(tracking_code);
create index if not exists idx_etsy_tracking_events_event_time
  on public.etsy_tracking_events(event_time desc);

create table if not exists public.etsy_shop_listings (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.etsy_integrations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  stock_item_id bigint null references public.stock_items(id) on delete set null,
  shop_id text,
  shop_name text,
  listing_id bigint not null,
  sku text,
  title text,
  state text,
  quantity integer,
  price_amount numeric(12,2),
  currency_code text,
  url text,
  image_url text,
  synced_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.etsy_shop_listings add column if not exists integration_id uuid;
alter table if exists public.etsy_shop_listings add column if not exists user_id uuid;
alter table if exists public.etsy_shop_listings add column if not exists company_id uuid;
alter table if exists public.etsy_shop_listings add column if not exists stock_item_id bigint;
alter table if exists public.etsy_shop_listings add column if not exists shop_id text;
alter table if exists public.etsy_shop_listings add column if not exists shop_name text;
alter table if exists public.etsy_shop_listings add column if not exists listing_id bigint;
alter table if exists public.etsy_shop_listings add column if not exists sku text;
alter table if exists public.etsy_shop_listings add column if not exists title text;
alter table if exists public.etsy_shop_listings add column if not exists state text;
alter table if exists public.etsy_shop_listings add column if not exists quantity integer;
alter table if exists public.etsy_shop_listings add column if not exists price_amount numeric(12,2);
alter table if exists public.etsy_shop_listings add column if not exists currency_code text;
alter table if exists public.etsy_shop_listings add column if not exists url text;
alter table if exists public.etsy_shop_listings add column if not exists image_url text;
alter table if exists public.etsy_shop_listings add column if not exists synced_at timestamptz;
alter table if exists public.etsy_shop_listings add column if not exists raw_payload jsonb;
alter table if exists public.etsy_shop_listings add column if not exists created_at timestamptz;
alter table if exists public.etsy_shop_listings add column if not exists updated_at timestamptz;

alter table if exists public.etsy_shop_listings
  alter column stock_item_id type bigint
  using case when stock_item_id is null then null else stock_item_id::bigint end;
alter table if exists public.etsy_shop_listings alter column raw_payload set default '{}'::jsonb;
alter table if exists public.etsy_shop_listings alter column created_at set default now();
alter table if exists public.etsy_shop_listings alter column updated_at set default now();

create unique index if not exists etsy_shop_listings_listing_id_key
  on public.etsy_shop_listings(listing_id);
create index if not exists idx_etsy_shop_listings_company_id
  on public.etsy_shop_listings(company_id);
create index if not exists idx_etsy_shop_listings_stock_item_id
  on public.etsy_shop_listings(stock_item_id);
create index if not exists idx_etsy_shop_listings_sku
  on public.etsy_shop_listings(sku);

create or replace function public.touch_etsy_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists etsy_integrations_touch_updated_at on public.etsy_integrations;
create trigger etsy_integrations_touch_updated_at
before update on public.etsy_integrations
for each row execute procedure public.touch_etsy_updated_at();

drop trigger if exists etsy_orders_touch_updated_at on public.etsy_orders;
create trigger etsy_orders_touch_updated_at
before update on public.etsy_orders
for each row execute procedure public.touch_etsy_updated_at();

drop trigger if exists etsy_order_items_touch_updated_at on public.etsy_order_items;
create trigger etsy_order_items_touch_updated_at
before update on public.etsy_order_items
for each row execute procedure public.touch_etsy_updated_at();

drop trigger if exists etsy_tracking_events_touch_updated_at on public.etsy_tracking_events;
create trigger etsy_tracking_events_touch_updated_at
before update on public.etsy_tracking_events
for each row execute procedure public.touch_etsy_updated_at();

drop trigger if exists etsy_shop_listings_touch_updated_at on public.etsy_shop_listings;
create trigger etsy_shop_listings_touch_updated_at
before update on public.etsy_shop_listings
for each row execute procedure public.touch_etsy_updated_at();

alter table public.etsy_integrations enable row level security;
alter table public.etsy_orders enable row level security;
alter table public.etsy_order_items enable row level security;
alter table public.etsy_tracking_events enable row level security;
alter table public.etsy_shop_listings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'admins manage etsy integrations'
      and polrelid = 'public.etsy_integrations'::regclass
  ) then
    create policy "admins manage etsy integrations"
      on public.etsy_integrations
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
    where polname = 'users manage own etsy integrations'
      and polrelid = 'public.etsy_integrations'::regclass
  ) then
    create policy "users manage own etsy integrations"
      on public.etsy_integrations
      for all
      to authenticated
      using (user_id = auth.uid() or company_id = public.current_company_id())
      with check (user_id = auth.uid() or company_id = public.current_company_id());
  end if;
end;
$$;

do $$
declare
  tbl regclass;
begin
  foreach tbl in array array[
    'public.etsy_orders'::regclass,
    'public.etsy_order_items'::regclass,
    'public.etsy_tracking_events'::regclass,
    'public.etsy_shop_listings'::regclass
  ]
  loop
    if not exists (
      select 1 from pg_policy
      where polname = 'admins manage ' || split_part(tbl::text, '.', 2)
        and polrelid = tbl
    ) then
      execute format(
        'create policy %I on %s for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        'admins manage ' || split_part(tbl::text, '.', 2),
        tbl
      );
    end if;

    if not exists (
      select 1 from pg_policy
      where polname = 'users manage ' || split_part(tbl::text, '.', 2)
        and polrelid = tbl
    ) then
      execute format(
        'create policy %I on %s for all to authenticated using (user_id = auth.uid() or company_id = public.current_company_id()) with check (user_id = auth.uid() or company_id = public.current_company_id())',
        'users manage ' || split_part(tbl::text, '.', 2),
        tbl
      );
    end if;
  end loop;
end;
$$;
