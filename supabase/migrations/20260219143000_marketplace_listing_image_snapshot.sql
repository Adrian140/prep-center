alter table public.client_market_listings
  add column if not exists image_url text;

update public.client_market_listings cml
set image_url = si.image_url
from public.stock_items si
where cml.stock_item_id = si.id
  and (cml.image_url is null or btrim(cml.image_url) = '')
  and si.image_url is not null
  and btrim(si.image_url) <> '';
