-- 043_enable_pricing_services_policies.sql
-- Ensure pricing services table is protected with the same admin policies as the other CMS tables.

alter table if exists public.pricing_services enable row level security;

drop policy if exists "Anyone can view pricing services" on public.pricing_services;
create policy "Anyone can view pricing services"
  on public.pricing_services
  for select
  using (true);

drop policy if exists "Admins can manage pricing services" on public.pricing_services;
create policy "Admins can manage pricing services"
  on public.pricing_services
  for all
  using (is_admin())
  with check (is_admin());
