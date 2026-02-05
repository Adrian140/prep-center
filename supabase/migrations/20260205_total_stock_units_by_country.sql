begin;

create or replace function public.get_total_stock_units_by_country(
  p_country text,
  p_company_id uuid default null
)
returns table (total_qty numeric)
language sql
security definer
set search_path = public
as $$
  select coalesce(
    sum(
      greatest(
        coalesce((si.prep_qty_by_country ->> upper(coalesce(p_country, 'FR')))::numeric, 0),
        0
      )
    ),
    0
  ) as total_qty
  from public.stock_items si
  join public.companies c on c.id = si.company_id
  where (p_company_id is null or si.company_id = p_company_id)
    and upper(coalesce(c.warehouse_country, 'FR')) = upper(coalesce(p_country, 'FR'));
$$;

revoke all on function public.get_total_stock_units_by_country(text, uuid) from public;
grant execute on function public.get_total_stock_units_by_country(text, uuid) to authenticated;

commit;
