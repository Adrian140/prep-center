begin;

-- Ensure idempotent: drop any previous select policies before recreating
drop policy if exists "analytics_select_auth" on public.analytics_visits;
drop policy if exists "analytics_select_admin" on public.analytics_visits;

create policy "analytics_select_auth"
  on public.analytics_visits
  as permissive
  for select
  to authenticated
  using (true);

commit;
