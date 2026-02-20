alter table public.client_market_listings
  add column if not exists link_fr text,
  add column if not exists link_de text;
