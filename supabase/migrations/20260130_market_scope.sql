alter table public.stock_items
  add column if not exists prep_qty_by_country jsonb not null default '{}'::jsonb;

update public.stock_items
set prep_qty_by_country = jsonb_build_object('FR', qty)
where prep_qty_by_country is null
   or prep_qty_by_country = '{}'::jsonb;

set local session_replication_role = replica;

alter table public.fba_lines
  add column if not exists country text default 'FR';

update public.fba_lines
set country = coalesce(country, 'FR');

alter table public.fbm_lines
  add column if not exists country text default 'FR';

update public.fbm_lines
set country = coalesce(country, 'FR');

alter table public.other_lines
  add column if not exists country text default 'FR';

update public.other_lines
set country = coalesce(country, 'FR');

alter table public.invoices
  add column if not exists country text default 'FR';

update public.invoices
set country = coalesce(country, 'FR');

alter table public.returns
  add column if not exists country text default 'FR';

update public.returns
set country = coalesce(country, 'FR');

alter table public.profiles
  add column if not exists allowed_markets text[] default '{FR}';

update public.profiles
set allowed_markets = array['FR']::text[]
where allowed_markets is null;

alter table public.profiles
  add column if not exists is_super_admin boolean default false;

set local session_replication_role = origin;
