-- Add visitor-level metadata to analytics_visits
alter table if exists public.analytics_visits
  add column if not exists visitor_id text,
  add column if not exists locale text,
  add column if not exists user_agent text;

create index if not exists analytics_visits_visitor_id_idx on public.analytics_visits (visitor_id);
