begin;

-- Admin-only view of inventory staleness per company
create or replace function public.get_inventory_staleness()
returns table (
  company_id uuid,
  company_name text,
  units_in_stock integer,
  last_receiving_date date,
  days_since_last_receiving integer
)
language sql
security definer
set search_path = public
as $$
  with inv as (
    select si.company_id, sum(greatest(coalesce(si.qty,0),0)) as units
    from public.stock_items si
    group by 1
  ),
  recv as (
    select rs.company_id,
           max(
             coalesce(
               rs.processed_at,
               rs.received_at,
               rs.submitted_at,
               rs.created_at
             )
           )::date as last_recv
    from public.receiving_shipments rs
    group by 1
  )
  select c.id as company_id,
         c.name as company_name,
         coalesce(inv.units,0) as units_in_stock,
         recv.last_recv as last_receiving_date,
         case
           when recv.last_recv is null then null
           else (current_date - recv.last_recv)
         end as days_since_last_receiving
  from public.companies c
  left join inv on inv.company_id = c.id
  left join recv on recv.company_id = c.id
  where coalesce(inv.units,0) > 0;
$$;

revoke all on function public.get_inventory_staleness() from public;
grant execute on function public.get_inventory_staleness() to authenticated;

commit;
