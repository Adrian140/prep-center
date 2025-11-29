-- Cache poze pe ASIN în Supabase (fără storage local)
create table if not exists public.asin_assets (
  asin text primary key,
  image_urls jsonb not null default '[]'::jsonb,
  source text,
  fetched_at timestamptz,
  updated_at timestamptz default now()
);

alter table public.asin_assets enable row level security;

-- Citire: front-end (anon/authenticated) are acces read-only
create policy "Public read asin_assets"
on public.asin_assets
for select
using (true);

-- Scriere: doar service_role (worker cu service key)
create policy "Service role write asin_assets"
on public.asin_assets
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

comment on table public.asin_assets is 'Cache centralizat pentru poze Keepa/Amazon per ASIN; reutilizabil între clienți';
