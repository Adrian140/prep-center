create table if not exists public.product_blueprints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  stock_item_id bigint not null references public.stock_items(id) on delete cascade,
  supplier_name text,
  supplier_number text,
  supplier_url text,
  supplier_price numeric,
  manufacturer text,
  manufacturer_number text,
  product_ext_id text,
  approx_price_ebay numeric,
  approx_price_fbm numeric,
  weight_value numeric,
  weight_unit text,
  package_width numeric,
  package_height numeric,
  package_length numeric,
  package_unit text,
  units_measure text,
  units_count numeric,
  condition text,
  ship_template text,
  notes text,
  created_at timestamptz default now()
);

alter table public.product_blueprints enable row level security;

create policy if not exists product_blueprints_owner_manage
on public.product_blueprints
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
