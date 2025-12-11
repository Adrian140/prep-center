-- Add limited admin flag and guard policies
begin;

alter table if exists public.profiles
  add column if not exists is_limited_admin boolean not null default false;

create or replace function public.is_limited_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public','extensions'
as $$
  select coalesce((
    select is_limited_admin
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

create or replace function public.is_limited_admin(uid uuid)
returns boolean
language sql
stable
set search_path to 'public','extensions'
as $$
  select coalesce((
    select is_limited_admin
    from public.profiles p
    where p.id = uid
  ), false);
$$;

-- Billing profiles delete policy
reset search_path;

drop policy if exists "billing admin delete all" on public.billing_profiles;
create policy "billing admin delete all"
  on public.billing_profiles
  as permissive
  for delete
  to authenticated
using (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.account_type = 'admin'
  )
  AND NOT public.is_limited_admin(auth.uid())
);

-- FBA delete policy
set search_path to public;

drop policy if exists "fba_delete_admin" on public.fba_lines;
create policy "fba_delete_admin"
  on public.fba_lines
  as permissive
  for delete
  to authenticated
using (public.e_admin() AND NOT public.is_limited_admin());

-- FBM delete policy
drop policy if exists "fbm_delete_admin" on public.fbm_lines;
create policy "fbm_delete_admin"
  on public.fbm_lines
  as permissive
  for delete
  to authenticated
using (public.e_admin() AND NOT public.is_limited_admin());

-- Prep request items delete policy
drop policy if exists "pri_delete" on public.prep_request_items;
create policy "pri_delete"
  on public.prep_request_items
  as permissive
  for delete
  to public
using (
  EXISTS (
    SELECT 1
    FROM public.prep_requests pr
    WHERE pr.id = prep_request_items.prep_request_id
      AND (pr.user_id = auth.uid() OR public.is_admin(auth.uid()))
      AND pr.status = 'pending'
  )
  AND NOT public.is_limited_admin(auth.uid())
);

-- Prep requests delete policy
drop policy if exists "pr_delete" on public.prep_requests;
create policy "pr_delete"
  on public.prep_requests
  as permissive
  for delete
  to public
using (
  ((user_id = auth.uid()) OR public.is_admin(auth.uid()))
  AND status = 'pending'
  AND NOT public.is_limited_admin(auth.uid())
);

-- Returns delete policy
drop policy if exists "returns_delete_admin" on public.returns;
create policy "returns_delete_admin"
  on public.returns
  as permissive
  for delete
  to authenticated
using (public.e_admin() AND NOT public.is_limited_admin());

-- Stock items delete policy
drop policy if exists "stock_delete_admin" on public.stock_items;
create policy "stock_delete_admin"
  on public.stock_items
  as permissive
  for delete
  to authenticated
using (public.e_admin() AND NOT public.is_limited_admin());

-- User guides delete policy
drop policy if exists "user_guides_delete" on public.user_guides;
create policy "user_guides_delete"
  on public.user_guides
  as permissive
  for delete
  to authenticated
using (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.is_admin, false) = true
      AND COALESCE(p.is_limited_admin, false) = false
  )
);

-- Invoice policies (public.invoices)
drop policy if exists "admins can delete invoices" on public.invoices;
create policy "admins can delete invoices"
  on public.invoices
  as permissive
  for delete
  to authenticated
using (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.account_type = 'admin'
  )
  AND NOT public.is_limited_admin(auth.uid())
);

drop policy if exists "admins can insert invoices" on public.invoices;
create policy "admins can insert invoices"
  on public.invoices
  as permissive
  for insert
  to authenticated
with check (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.account_type = 'admin'
  )
  AND NOT public.is_limited_admin(auth.uid())
);

drop policy if exists "admins can update invoices" on public.invoices;
create policy "admins can update invoices"
  on public.invoices
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

drop policy if exists "select invoices (self or admin)" on public.invoices;
create policy "select invoices (self or admin)"
  on public.invoices
  as permissive
  for select
  to authenticated
using (
  (user_id = auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.account_type = 'admin'
    )
    AND NOT public.is_limited_admin(auth.uid())
  )
);

-- Billing invoices policies
drop policy if exists "billing invoices admin select" on public.billing_invoices;
create policy "billing invoices admin select"
  on public.billing_invoices
  as permissive
  for select
  to authenticated
using (public.e_admin() AND NOT public.is_limited_admin());

drop policy if exists "billing invoices admin insert" on public.billing_invoices;
create policy "billing invoices admin insert"
  on public.billing_invoices
  as permissive
  for insert
  to authenticated
with check (public.e_admin() AND NOT public.is_limited_admin());

drop policy if exists "billing invoices admin update" on public.billing_invoices;
create policy "billing invoices admin update"
  on public.billing_invoices
  as permissive
  for update
  to authenticated
using (public.e_admin() AND NOT public.is_limited_admin())
with check (public.e_admin() AND NOT public.is_limited_admin());

drop policy if exists "billing invoices admin delete" on public.billing_invoices;
create policy "billing invoices admin delete"
  on public.billing_invoices
  as permissive
  for delete
  to authenticated
using (public.e_admin() AND NOT public.is_limited_admin());

commit;
