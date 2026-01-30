set local session_replication_role = replica;

alter table public.receiving_shipments
  add column if not exists warehouse_country text default 'FR';

update public.receiving_shipments
set warehouse_country = coalesce(warehouse_country, 'FR');

alter table public.prep_requests
  add column if not exists warehouse_country text default 'FR';

update public.prep_requests
set warehouse_country = coalesce(warehouse_country, 'FR');

alter table public.returns
  add column if not exists warehouse_country text default 'FR';

update public.returns
set warehouse_country = coalesce(warehouse_country, 'FR');

set local session_replication_role = origin;
