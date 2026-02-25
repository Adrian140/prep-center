alter table public.prep_requests
  add column if not exists completed_at timestamptz;

update public.prep_requests
set completed_at = coalesce(step4_confirmed_at, confirmed_at, created_at)
where status = 'confirmed'
  and completed_at is null;

create or replace function public.tg_set_prep_request_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmed' then
    if new.step4_confirmed_at is not null then
      new.completed_at := new.step4_confirmed_at;
    else
      new.completed_at := coalesce(new.completed_at, new.confirmed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists prep_requests_set_completed_at on public.prep_requests;
create trigger prep_requests_set_completed_at
before insert or update of status, confirmed_at, step4_confirmed_at, completed_at
on public.prep_requests
for each row
execute function public.tg_set_prep_request_completed_at();

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
  update public.prep_requests pr
  set id = pr.id
  where pr.id = p_request_id
    and pr.status = 'pending'
  returning pr.user_id, coalesce(pr.obs_admin, '') into v_user_id, v_note;

  if not found then
    raise exception 'Request not found or not pending' using errcode = 'P0001';
  end if;

  update public.prep_request_items i
  set units_sent    = coalesce(i.units_sent, i.units_requested),
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

  update public.prep_requests
  set status       = 'confirmed',
      confirmed_by = p_admin_id,
      confirmed_at = now(),
      completed_at = coalesce(step4_confirmed_at, now())
  where id = p_request_id;

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
      inventory_deducted_at = now(),
      completed_at = now()
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
    coalesce(pr.completed_at, pr.step4_confirmed_at, pr.confirmed_at, pr.created_at)::date,
    s.unit_price,
    sum(s.units)::integer,
    pr.fba_shipment_id,
    pr.user_id,
    pr.user_id,
    v_market
  from public.prep_request_services s
  join public.prep_requests pr on pr.id = s.request_id
  where s.request_id = p_request_id
  group by pr.company_id, s.service_name, coalesce(pr.completed_at, pr.step4_confirmed_at, pr.confirmed_at, pr.created_at)::date, s.unit_price, pr.fba_shipment_id, pr.user_id;

  return v_deducted;
end;
$$;
