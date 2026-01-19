-- Admin-only RPC pentru total unități recepționate (interval)
begin;

create or replace function public.get_receiving_units(
  p_start_date date,
  p_end_date date,
  p_company_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
begin
  -- doar admini, fără limited_admin
  if not public.e_admin() or public.is_limited_admin(auth.uid()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select coalesce(sum(ri.quantity_received), 0)
  into v_total
  from public.receiving_items ri
  join public.receiving_shipments rs on rs.id = ri.shipment_id
  where coalesce(rs.processed_at, rs.received_at, rs.submitted_at, rs.created_at) >= coalesce(p_start_date::timestamp, now()::date)
    and coalesce(rs.processed_at, rs.received_at, rs.submitted_at, rs.created_at) < (coalesce(p_end_date, now()::date) + 1)::timestamp
    and (p_company_id is null or rs.company_id = p_company_id);

  return v_total;
end;
$$;

revoke all on function public.get_receiving_units(date, date, uuid) from public;
grant execute on function public.get_receiving_units(date, date, uuid) to authenticated;

commit;
