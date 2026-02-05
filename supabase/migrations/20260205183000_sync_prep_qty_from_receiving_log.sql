create or replace function public.update_prep_qty_by_country_from_receiving_log()
returns trigger
language plpgsql
as $function$
declare
  v_country text;
  v_stock_id bigint;
  v_qty integer;
  v_current integer;
  v_map jsonb;
begin
  v_stock_id := new.stock_item_id;
  if v_stock_id is null then
    return new;
  end if;

  select rs.warehouse_country
    into v_country
  from public.receiving_items ri
  join public.receiving_shipments rs on rs.id = ri.shipment_id
  where ri.id = new.receiving_item_id;

  if v_country is null then
    return new;
  end if;

  v_country := upper(v_country);
  v_qty := coalesce(new.quantity_moved, 0);
  if v_qty <= 0 then
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
  v_map := jsonb_set(v_map, array[v_country], to_jsonb(v_current + v_qty), true);

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

drop trigger if exists trg_update_prep_qty_from_receiving_log on public.receiving_to_stock_log;
create trigger trg_update_prep_qty_from_receiving_log
after insert on public.receiving_to_stock_log
for each row
execute function public.update_prep_qty_by_country_from_receiving_log();
