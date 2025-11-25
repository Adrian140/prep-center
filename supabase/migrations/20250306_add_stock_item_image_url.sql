-- Add an image URL column so we can store the Amazon catalog photo for each SKU.
alter table if exists public.stock_items
  add column if not exists image_url text;

comment on column public.stock_items.image_url is
  'Primary product image fetched from Amazon catalog sync.';
