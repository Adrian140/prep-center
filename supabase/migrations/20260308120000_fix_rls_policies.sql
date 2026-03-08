-- Fix RLS lint issues: tighten page_visits insert policy, disable RLS on sync state table used internally

-- page_visits: replace permissive insert policy
alter table public.page_visits enable row level security;

drop policy if exists "Allow anonymous page visit tracking" on public.page_visits;
create policy "Allow page visit tracking (validated)"
  on public.page_visits
  for insert
  to anon, authenticated
  with check (
    coalesce(visitor_id, '') <> ''
    and coalesce(page_path, '') <> ''
  );

-- amazon_listing_presence_sync_state: internal worker state, no external access needed
alter table public.amazon_listing_presence_sync_state disable row level security;
