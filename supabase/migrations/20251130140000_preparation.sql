alter table if exists public.stock_items add column if not exists keepa_retry_at timestamptz;
create index if not exists idx_stock_items_keepa_retry_at on public.stock_items (keepa_retry_at);
