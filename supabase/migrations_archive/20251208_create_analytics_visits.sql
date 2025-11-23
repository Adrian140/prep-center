-- Create analytics_visits table for internal tracking
create table if not exists public.analytics_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  path text,
  referrer text
);

create index if not exists analytics_visits_created_at_idx on public.analytics_visits (created_at);
create index if not exists analytics_visits_path_idx on public.analytics_visits (path);
create index if not exists analytics_visits_referrer_idx on public.analytics_visits (referrer);
