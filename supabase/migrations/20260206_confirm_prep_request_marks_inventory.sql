create or replace function public.confirm_prep_request_v2(p_request_id uuid, p_admin_id uuid)
 returns table(request_id uuid, email text, client_name text, company_name text, items jsonb, note text)
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user_id   uuid;
  v_email     text;
  v_first     text;
  v_last      text;
  v_company   text;
  v_note      text;
  v_market    text;
begin
  -- 1) Lock pe header (fara join-uri)
  update public.prep_requests pr
  set id = pr.id
  where pr.id = p_request_id
    and pr.status = 'pending'
  returning pr.user_id, coalesce(pr.obs_admin, '') into v_user_id, v_note;

  if not found then
    raise exception 'Request not found or not pending' using errcode = 'P0001';
  end if;

  -- 2) Normalizeaza valorile pe items
  update public.prep_request_items i
  set units_sent    = coalesce(i.units_sent, i.units_requested),
      units_removed = greatest(0, i.units_requested - coalesce(i.units_sent, i.units_requested))
  where i.prep_request_id = p_request_id;

  -- 3) Lock pe randurile de stock
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

  -- 4) Decrement stoc pe market (prep_qty_by_country)
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

  -- 4b) Recalculeaza qty total din map
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

  -- 5) Marcheaza cererea confirmata + blocheaza deducerea ulterioara in finalizare
  update public.prep_requests
  set status       = 'confirmed',
      confirmed_by = p_admin_id,
      confirmed_at = now(),
      inventory_deducted_at = coalesce(inventory_deducted_at, now())
  where id = p_request_id;

  -- 6) Payload pentru email
  select p.email, p.first_name, p.last_name, p.company_name
    into v_email, v_first, v_last, v_company
  from public.profiles p
  where p.id = v_user_id;

  return query
  select p_request_id,
         v_email,
         trim(coalesce(v_first, '') || ' ' || coalesce(v_last, '')) as client_name,
         v_company,
         (
            select jsonb_agg(
              jsonb_build_object(
                'product_name', i.product_name,
                'asin', i.asin,
                'sku', i.sku,
                'units_requested', i.units_requested,
                'units_sent', i.units_sent,
                'units_removed', i.units_removed
              )
            )
            from public.prep_request_items i
            where i.prep_request_id = p_request_id
         ) as items,
         v_note;
end;
$$;
