-- Add Amazon snapshot + prep-center explicit status for prep_requests
alter table public.prep_requests
  add column if not exists prep_status text default 'pending',
  add column if not exists amazon_status text,
  add column if not exists amazon_units_expected integer,
  add column if not exists amazon_units_located integer,
  add column if not exists amazon_skus integer,
  add column if not exists amazon_shipment_name text,
  add column if not exists amazon_reference_id text,
  add column if not exists amazon_destination_code text,
  add column if not exists amazon_delivery_window text,
  add column if not exists amazon_last_updated timestamptz,
  add column if not exists amazon_last_synced_at timestamptz,
  add column if not exists amazon_sync_error text,
  add column if not exists amazon_snapshot jsonb;

create index if not exists prep_requests_fba_shipment_id_idx on public.prep_requests (fba_shipment_id);
create index if not exists prep_requests_amazon_status_idx on public.prep_requests (amazon_status);
create index if not exists prep_requests_prep_status_idx on public.prep_requests (prep_status);
