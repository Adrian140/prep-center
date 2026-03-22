create or replace function public.cancel_prep_request_inventory(p_request_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_market text;
  v_company_id uuid;
  v_user_id uuid;
  v_service_date date;
  v_fba_shipment_id text;
begin
  select
    upper(coalesce(pr.warehouse_country, pr.destination_country, 'FR')),
    pr.company_id,
    pr.user_id,
    coalesce(pr.completed_at, pr.step4_confirmed_at, pr.confirmed_at, pr.created_at)::date,
    pr.fba_shipment_id
  into
    v_market,
    v_company_id,
    v_user_id,
    v_service_date,
    v_fba_shipment_id
  from public.prep_requests pr
  where pr.id = p_request_id
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.prep_requests pr
    where pr.id = p_request_id
      and pr.inventory_deducted_at is not null
  ) then
    perform 1
    from public.stock_items s
    where s.id in (
      select i.stock_item_id
      from public.prep_request_items i
      where i.prep_request_id = p_request_id
        and i.stock_item_id is not null
    )
    for update;

    update public.stock_items s
    set prep_qty_by_country = jsonb_set(
          coalesce(s.prep_qty_by_country, '{}'::jsonb),
          array[v_market],
          to_jsonb(
            coalesce((s.prep_qty_by_country->>v_market)::numeric, s.qty, 0) +
            coalesce(i.units_sent, i.units_requested, 0)
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

    delete from public.fba_lines f
    using public.prep_request_services prs
    where prs.request_id = p_request_id
      and f.company_id = v_company_id
      and f.user_id = v_user_id
      and f.service = prs.service_name
      and f.unit_price = prs.unit_price
      and f.units = prs.units
      and f.service_date = v_service_date
      and f.obs_admin is not distinct from v_fba_shipment_id;

    delete from public.fba_lines f
    using public.prep_request_heavy_parcel h
    where h.request_id = p_request_id
      and upper(coalesce(h.market, '')) = v_market
      and coalesce(h.labels_count, 0) > 0
      and f.company_id = v_company_id
      and f.user_id = v_user_id
      and f.service = 'Heavy Parcel'
      and f.unit_price = h.unit_price
      and f.units = h.labels_count
      and f.service_date = v_service_date
      and f.obs_admin is not distinct from v_fba_shipment_id;
  end if;

  update public.prep_requests pr
  set status = 'cancelled',
      prep_status = 'cancelled',
      amazon_status = 'CANCELLED',
      step2_confirmed_at = null,
      step4_confirmed_at = null,
      completed_at = null,
      inventory_deducted_at = null
  where pr.id = p_request_id;

  return true;
end;
$$;
