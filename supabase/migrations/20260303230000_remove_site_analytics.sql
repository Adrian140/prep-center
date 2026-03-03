-- Remove legacy site analytics collection and aggregation logic.

-- Drop admin aggregation function if present.
drop function if exists public.get_analytics_admin(integer);

-- Drop known policies defensively before dropping table.
drop policy if exists "analytics_insert_all" on public.analytics_visits;
drop policy if exists "analytics_insert_client_or_anon" on public.analytics_visits;
drop policy if exists "analytics_select_auth" on public.analytics_visits;
drop policy if exists "analytics_select_admin" on public.analytics_visits;

-- Remove raw site visit storage.
drop table if exists public.analytics_visits;
