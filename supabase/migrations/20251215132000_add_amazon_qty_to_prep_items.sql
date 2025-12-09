alter table public.prep_request_items
  add column if not exists amazon_units_expected integer,
  add column if not exists amazon_units_received integer;
