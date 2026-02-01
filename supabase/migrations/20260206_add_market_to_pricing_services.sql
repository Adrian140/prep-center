-- Add market column to pricing services so pricing can be scoped per country
alter table public.pricing_services
  add column if not exists market text not null default 'FR';

create index if not exists pricing_services_market_idx
  on public.pricing_services (market);

