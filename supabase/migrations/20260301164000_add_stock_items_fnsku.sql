alter table if exists public.stock_items
  add column if not exists fnsku text;
