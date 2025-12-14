-- Packing templates reusable per client/SKU/marketplace
create table if not exists public.packing_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid,
  marketplace_id text,
  sku text,
  asin text,
  name text not null,
  template_type text not null default 'case',
  units_per_box integer,
  box_length_cm numeric(10,2),
  box_width_cm numeric(10,2),
  box_height_cm numeric(10,2),
  box_weight_kg numeric(10,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists packing_templates_company_sku_idx on public.packing_templates (company_id, marketplace_id, sku);
create index if not exists packing_templates_company_asin_idx on public.packing_templates (company_id, marketplace_id, asin);

-- Track packing choice per prep_request_item (current shipment)
alter table public.prep_request_items
  add column if not exists packing_template_id uuid,
  add column if not exists packing_template_name text,
  add column if not exists packing_template_type text,
  add column if not exists units_per_box integer,
  add column if not exists boxes_count integer,
  add column if not exists box_length_cm numeric(10,2),
  add column if not exists box_width_cm numeric(10,2),
  add column if not exists box_height_cm numeric(10,2),
  add column if not exists box_weight_kg numeric(10,3);

create index if not exists prep_request_items_packing_template_id_idx on public.prep_request_items (packing_template_id);
