alter table if exists public.prep_requests
  add column if not exists step2_confirmed_at timestamptz;

alter table if exists public.prep_requests
  add column if not exists step2_summary jsonb;

alter table if exists public.prep_requests
  add column if not exists step2_shipments jsonb;
