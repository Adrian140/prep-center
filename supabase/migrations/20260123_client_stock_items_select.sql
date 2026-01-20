begin;

drop policy if exists "client_stock_items_select_admin" on public.client_stock_items;
create policy "client_stock_items_select_admin"
  on public.client_stock_items
  as permissive
  for select
  to authenticated
  using (public.e_admin() and not public.is_limited_admin(auth.uid()));

commit;
