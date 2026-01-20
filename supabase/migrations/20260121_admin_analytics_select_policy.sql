begin;

-- Allow admin users to read analytics_visits for dashboards (fallback when RPC fails).
drop policy if exists "analytics_select_admin" on public.analytics_visits;
create policy "analytics_select_admin"
  on public.analytics_visits
  as permissive
  for select
  to authenticated
  using (public.e_admin() and not public.is_limited_admin(auth.uid()));

commit;
