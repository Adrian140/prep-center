-- Create page_visits table for analytics tracking
create table if not exists public.page_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  page_path text not null,
  referrer text,
  user_agent text,
  country text,
  city text,
  device_type text,
  browser text,
  created_at timestamptz default now()
);

-- Create index for faster queries
create index if not exists idx_page_visits_created_at on public.page_visits(created_at desc);
create index if not exists idx_page_visits_visitor_id on public.page_visits(visitor_id);
create index if not exists idx_page_visits_page_path on public.page_visits(page_path);

-- Enable RLS
alter table public.page_visits enable row level security;

-- Policies
drop policy if exists "Allow anonymous page visit tracking" on public.page_visits;
create policy "Allow anonymous page visit tracking"
  on public.page_visits
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admins can view all page visits" on public.page_visits;
create policy "Admins can view all page visits"
  on public.page_visits
  for select
  to authenticated
  using (public.is_admin());

-- Grants
grant insert on public.page_visits to anon, authenticated;
grant select on public.page_visits to authenticated;
