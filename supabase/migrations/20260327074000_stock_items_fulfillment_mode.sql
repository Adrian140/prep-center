begin;

alter table if exists public.stock_items
  add column if not exists amazon_fulfillment_mode text;

alter table if exists public.stock_items
  add column if not exists amazon_fulfillment_channels text[] not null default '{}'::text[];

create index if not exists idx_stock_items_fulfillment_mode
  on public.stock_items (company_id, amazon_fulfillment_mode);

commit;
