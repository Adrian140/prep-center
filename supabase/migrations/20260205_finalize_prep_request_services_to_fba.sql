create or replace function public.finalize_prep_request_inventory(p_request_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_market text;
  v_deducted boolean;
begin
  update public.prep_requests pr
  set step4_confirmed_at = now(),
      inventory_deducted_at = now()
  where pr.id = p_request_id
    and pr.inventory_deducted_at is null
  returning true into v_deducted;

  if not found then
    return false;
  end if;

  update public.prep_request_items i
  set units_sent = coalesce(i.units_sent, i.units_requested),
      units_removed = greatest(0, i.units_requested - coalesce(i.units_sent, i.units_requested))
  where i.prep_request_id = p_request_id;

  perform 1
  from public.stock_items s
  where s.id in (
    select i.stock_item_id
    from public.prep_request_items i
    where i.prep_request_id = p_request_id
      and i.stock_item_id is not null
  )
  for update;

  select upper(coalesce(pr.warehouse_country, pr.destination_country, 'FR'))
    into v_market
  from public.prep_requests pr
  where pr.id = p_request_id;

  if v_market is null then
    v_market := 'FR';
  end if;

  update public.stock_items s
  set prep_qty_by_country = jsonb_set(
        coalesce(s.prep_qty_by_country, '{}'::jsonb),
        array[v_market],
        to_jsonb(
          greatest(
            0,
            coalesce((s.prep_qty_by_country->>v_market)::numeric, s.qty, 0) - i.units_sent
          )
        ),
        true
      )
  from public.prep_request_items i
  where i.prep_request_id = p_request_id
    and i.stock_item_id is not null
    and s.id = i.stock_item_id;

  update public.stock_items s
  set qty = (
    select coalesce(sum(value::numeric), 0)
    from jsonb_each_text(coalesce(s.prep_qty_by_country, '{}'::jsonb))
  )
  where s.id in (
    select i.stock_item_id
    from public.prep_request_items i
    where i.prep_request_id = p_request_id
      and i.stock_item_id is not null
  );

  insert into public.fba_lines (
    company_id,
    service,
    service_date,
    unit_price,
    units,
    obs_admin,
    created_by,
    user_id,
    country
  )
  select
    pr.company_id,
    s.service_name,
    pr.created_at::date,
    s.unit_price,
    sum(s.units)::integer,
    pr.fba_shipment_id,
    pr.user_id,
    pr.user_id,
    v_market
  from public.prep_request_services s
  join public.prep_requests pr on pr.id = s.request_id
  where s.request_id = p_request_id
  group by pr.company_id, s.service_name, pr.created_at::date, s.unit_price, pr.fba_shipment_id, pr.user_id;

  return v_deducted;
end;
$$;
