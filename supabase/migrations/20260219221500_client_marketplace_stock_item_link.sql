alter table public.client_market_listings
  add column if not exists stock_item_id uuid references public.stock_items(id) on delete set null;

create index if not exists client_market_listings_stock_item_idx
  on public.client_market_listings (stock_item_id);
