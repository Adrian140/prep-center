-- Separate informative destination split from operational warehouse stock map.
alter table if exists public.stock_items
  add column if not exists destination_qty_by_country jsonb not null default '{}'::jsonb;
