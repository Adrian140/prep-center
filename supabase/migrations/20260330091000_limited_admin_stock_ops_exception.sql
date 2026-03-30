begin;

create or replace function public.has_client_stock_ops_access(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and (
        coalesce(p.is_admin, false)
        or lower(coalesce(p.account_type, '')) = 'admin'
      )
      and (
        coalesce(p.is_limited_admin, false) = false
        or p.id = 'bc3ce361-b5c8-435f-a1b6-7ee9d33b3e67'::uuid
      )
  );
$$;

drop policy if exists "Admins can update stock" on public.stock_items;
create policy "Admins can update stock"
  on public.stock_items
  as permissive
  for update
  to authenticated
  using (public.has_client_stock_ops_access(auth.uid()))
  with check (public.has_client_stock_ops_access(auth.uid()));

create or replace function public.fn_stock_limited_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    (new.ean is distinct from old.ean or new.qty is distinct from old.qty)
    and not public.has_client_stock_ops_access(auth.uid())
  ) then
    raise exception 'You are not allowed to modify EAN or quantity';
  end if;
  return new;
end;
$$;

commit;
