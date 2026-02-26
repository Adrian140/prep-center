-- Route receiving stock updates by destination country so FR/DE prep centers stay separated in listing totals.
create or replace function public.update_prep_qty_by_country_from_receiving_log()
returns trigger
language plpgsql
as $function$
declare
  v_country text;
  v_stock_id bigint;
  v_qty integer;
  v_current integer;
  v_next integer;
  v_map jsonb;
begin
  v_stock_id := new.stock_item_id;
  if v_stock_id is null then
    return new;
  end if;

  select upper(coalesce(rs.destination_country, rs.warehouse_country, 'FR'))
    into v_country
  from public.receiving_items ri
  join public.receiving_shipments rs on rs.id = ri.shipment_id
  where ri.id = new.receiving_item_id;

  if v_country is null or v_country = '' then
    return new;
  end if;

  v_qty := coalesce(new.quantity_moved, 0);
  if v_qty = 0 then
    return new;
  end if;

  select prep_qty_by_country
    into v_map
  from public.stock_items
  where id = v_stock_id
  for update;

  if v_map is null then
    v_map := '{}'::jsonb;
  end if;

  v_current := coalesce((v_map->>v_country)::int, 0);
  v_next := greatest(0, v_current + v_qty);
  v_map := jsonb_set(v_map, array[v_country], to_jsonb(v_next), true);

  update public.stock_items
     set prep_qty_by_country = v_map,
         qty = (
           select coalesce(sum((value)::int), 0)
           from jsonb_each_text(v_map)
         )
   where id = v_stock_id;

  return new;
end;
$function$;
