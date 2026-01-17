-- Harden RLS policies flagged by lint and lock down stock writes.
begin;

-- Ensure stable search_path for trigger function.
create or replace function public.handle_amazon_integrations_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Admins table: remove temporary wide-open policy.
drop policy if exists "temp_allow_all_write" on public.admins;
create policy "admins_manage_admins"
  on public.admins
  as permissive
  for all
  to authenticated
  using (public.e_admin())
  with check (public.e_admin());

-- Companies: replace temp allow-all with scoped policies.
drop policy if exists "temp_allow_all_select" on public.companies;
drop policy if exists "temp_allow_all_write" on public.companies;
create policy "companies_select_self_or_admin"
  on public.companies
  as permissive
  for select
  to authenticated
  using (public.e_admin() OR id = public.current_company_id());
create policy "companies_manage_admins"
  on public.companies
  as permissive
  for all
  to authenticated
  using (public.e_admin() AND NOT public.is_limited_admin(auth.uid()))
  with check (public.e_admin() AND NOT public.is_limited_admin(auth.uid()));

-- Analytics visits: avoid permissive insert policy.
drop policy if exists "analytics_insert_all" on public.analytics_visits;
create policy "analytics_insert_client_or_anon"
  on public.analytics_visits
  as permissive
  for insert
  to anon, authenticated
  with check (
    (auth.role() in ('anon','authenticated'))
    and (user_id is null or user_id = auth.uid())
    and (company_id is null or company_id = public.current_company_id())
  );

-- Billing profiles: align WITH CHECK with USING and block limited admins.
drop policy if exists "billing admin update all" on public.billing_profiles;
create policy "billing admin update all"
  on public.billing_profiles
  as permissive
  for update
  to authenticated
  using (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.account_type = 'admin'
    )
    AND NOT public.is_limited_admin(auth.uid())
  )
  with check (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.account_type = 'admin'
    )
    AND NOT public.is_limited_admin(auth.uid())
  );

-- FBA/FBM lines: drop temporary allow-all policies.
drop policy if exists "temp_allow_all_select" on public.fba_lines;
drop policy if exists "temp_allow_all_write" on public.fba_lines;
drop policy if exists "temp_allow_all_select" on public.fbm_lines;
drop policy if exists "temp_allow_all_write" on public.fbm_lines;

-- Invitations: scope to company or admin.
drop policy if exists "temp_allow_all_write" on public.invitations;
drop policy if exists "temp_allow_all_select" on public.invitations;
create policy "invitations_company_scope"
  on public.invitations
  as permissive
  for select
  to authenticated
  using ((company_id = public.current_company_id()) OR public.e_admin());
create policy "invitations_company_manage"
  on public.invitations
  as permissive
  for all
  to authenticated
  using ((company_id = public.current_company_id()) OR public.e_admin())
  with check ((company_id = public.current_company_id()) OR public.e_admin());

-- Prep request audit/tracking: remove temp allow-all and restrict.
drop policy if exists "temp_allow_all_write" on public.prep_request_audit;
drop policy if exists "temp_allow_all_write" on public.prep_request_tracking;
create policy "prep_request_audit_admin_only"
  on public.prep_request_audit
  as permissive
  for all
  to authenticated
  using (public.e_admin())
  with check (public.e_admin());
create policy "prep_request_tracking_owner_or_admin"
  on public.prep_request_tracking
  as permissive
  for all
  to authenticated
  using (
    EXISTS (
      SELECT 1
      FROM public.prep_requests pr
      WHERE pr.id = prep_request_tracking.request_id
        AND (pr.user_id = auth.uid() OR public.e_admin())
    )
  )
  with check (
    EXISTS (
      SELECT 1
      FROM public.prep_requests pr
      WHERE pr.id = prep_request_tracking.request_id
        AND (pr.user_id = auth.uid() OR public.e_admin())
    )
  );

-- Site visits: make anon insert explicit and drop extra permissive policy.
drop policy if exists "allow insert visits (all)" on public.site_visits;
drop policy if exists "allow insert from anon" on public.site_visits;
create policy "allow insert from anon"
  on public.site_visits
  as permissive
  for insert
  to anon
  with check (auth.role() = 'anon');

-- Visit events: ensure insert is tied to an auth role.
drop policy if exists "visit_events_insert" on public.visit_events;
create policy "visit_events_insert"
  on public.visit_events
  as permissive
  for insert
  to anon, authenticated
  with check (auth.role() in ('anon','authenticated'));

-- Stock items: tighten admin update to real admins only.
drop policy if exists "Admins can update stock" on public.stock_items;
create policy "Admins can update stock"
  on public.stock_items
  as permissive
  for update
  to authenticated
  using (public.e_admin() AND NOT public.is_limited_admin(auth.uid()))
  with check (public.e_admin() AND NOT public.is_limited_admin(auth.uid()));

-- Prep requests: only admins can delete (clients can no longer delete).
drop policy if exists "pr_delete" on public.prep_requests;
create policy "pr_delete_admin_only"
  on public.prep_requests
  as permissive
  for delete
  to authenticated
  using (public.e_admin() AND NOT public.is_limited_admin(auth.uid()))
  with check (public.e_admin() AND NOT public.is_limited_admin(auth.uid()));

commit;
