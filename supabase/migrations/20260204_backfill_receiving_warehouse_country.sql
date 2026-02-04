-- Backfill warehouse_country using destination_country where absent
update public.receiving_shipments
set warehouse_country = upper(coalesce(warehouse_country, destination_country, 'FR'))
where warehouse_country is null or warehouse_country = '';

update public.prep_requests
set warehouse_country = upper(coalesce(warehouse_country, destination_country, 'FR'))
where warehouse_country is null or warehouse_country = '';

-- ensure defaults remain uppercase
alter table public.receiving_shipments alter column warehouse_country set default 'FR';
alter table public.prep_requests alter column warehouse_country set default 'FR';
