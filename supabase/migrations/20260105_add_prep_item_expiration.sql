-- Track expiration per prep_request_item (Step 1 persistence)
alter table public.prep_request_items
  add column if not exists expiration_date date,
  add column if not exists expiration_source text;
