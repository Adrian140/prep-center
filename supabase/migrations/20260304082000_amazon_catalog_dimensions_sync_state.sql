begin;

create table if not exists public.amazon_catalog_dimensions_sync_state (
  key text primary key,
  next_integration_index integer not null default 0,
  next_asin_index integer not null default 0,
  current_integration_id text,
  cycle_started_at timestamptz,
  cycle_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.amazon_catalog_dimensions_sync_state
  add column if not exists next_integration_index integer not null default 0,
  add column if not exists next_asin_index integer not null default 0,
  add column if not exists current_integration_id text,
  add column if not exists cycle_started_at timestamptz,
  add column if not exists cycle_completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

insert into public.amazon_catalog_dimensions_sync_state (key, next_integration_index, next_asin_index)
values ('default', 0, 0)
on conflict (key) do nothing;

-- Internal worker checkpoint table; no public access policies.
alter table public.amazon_catalog_dimensions_sync_state enable row level security;

commit;
