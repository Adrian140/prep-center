create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_receiving_shipments_admin_market_status_created
  on public.receiving_shipments (warehouse_country, status, created_at desc);

create index if not exists idx_receiving_shipments_admin_market_received
  on public.receiving_shipments (warehouse_country, received_at desc);

create index if not exists idx_receiving_items_shipment_id
  on public.receiving_items (shipment_id);

create index if not exists idx_receiving_item_events_receiving_item_created
  on public.receiving_item_events (receiving_item_id, created_at desc);

create index if not exists idx_receiving_shipments_tracking_trgm
  on public.receiving_shipments using gin (lower(coalesce(tracking_id, '')) extensions.gin_trgm_ops);

create index if not exists idx_profiles_store_name_trgm
  on public.profiles using gin (lower(coalesce(store_name, '')) extensions.gin_trgm_ops);

create index if not exists idx_profiles_email_trgm
  on public.profiles using gin (lower(coalesce(email, '')) extensions.gin_trgm_ops);

create index if not exists idx_companies_name_trgm
  on public.companies using gin (lower(coalesce(name, '')) extensions.gin_trgm_ops);

create index if not exists idx_receiving_items_sku_trgm
  on public.receiving_items using gin (lower(coalesce(sku, '')) extensions.gin_trgm_ops);

create index if not exists idx_receiving_items_product_name_trgm
  on public.receiving_items using gin (lower(coalesce(product_name, '')) extensions.gin_trgm_ops);

create index if not exists idx_receiving_items_ean_asin_trgm
  on public.receiving_items using gin (lower(coalesce(ean_asin, '')) extensions.gin_trgm_ops);

create index if not exists idx_receiving_shipment_items_asin_trgm
  on public.receiving_shipment_items using gin (lower(coalesce(asin, '')) extensions.gin_trgm_ops);

create index if not exists idx_receiving_shipment_items_sku_trgm
  on public.receiving_shipment_items using gin (lower(coalesce(sku, '')) extensions.gin_trgm_ops);

create index if not exists idx_receiving_shipment_items_product_name_trgm
  on public.receiving_shipment_items using gin (lower(coalesce(product_name, '')) extensions.gin_trgm_ops);

create index if not exists idx_receiving_shipment_items_ean_trgm
  on public.receiving_shipment_items using gin (lower(coalesce(ean, '')) extensions.gin_trgm_ops);

create or replace function public.search_admin_receiving_shipments(
  p_warehouse_country text default null,
  p_include_archive boolean default false,
  p_status text default 'all',
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  id uuid,
  status text,
  computed_status text,
  created_at timestamptz,
  updated_at timestamptz,
  received_at timestamptz,
  processed_at timestamptz,
  destination_country text,
  warehouse_country text,
  carrier text,
  carrier_other text,
  tracking_id text,
  tracking_ids text[],
  user_id uuid,
  user_email text,
  company_name text,
  client_name text,
  store_name text,
  prep_merchant_name text,
  import_source text,
  fba_mode text,
  line_count integer,
  total_units integer,
  has_fba_intent boolean,
  latest_received_at timestamptz,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
with params as (
  select
    greatest(coalesce(p_page, 1), 1) as page_number,
    least(greatest(coalesce(p_page_size, 50), 1), 100) as page_size,
    nullif(lower(trim(coalesce(p_search, ''))), '') as search_text,
    nullif(replace(lower(trim(coalesce(p_search, ''))), ' ', ''), '') as search_compact,
    case
      when p_status is null or lower(trim(p_status)) = 'all' then null
      else lower(trim(p_status))
    end as status_filter,
    coalesce(p_include_archive, false) as include_archive,
    nullif(upper(trim(coalesce(p_warehouse_country, ''))), '') as market_code
),
shipment_base as (
  select
    rs.id,
    rs.status,
    rs.created_at,
    coalesce(rs.processed_at, rs.received_at, rs.submitted_at, rs.created_at) as updated_at,
    rs.received_at,
    rs.processed_at,
    rs.destination_country,
    rs.warehouse_country,
    rs.carrier,
    rs.carrier_other,
    rs.tracking_id,
    rs.tracking_ids,
    rs.user_id,
    rs.import_source,
    rs.fba_mode,
    c.name as company_name,
    p.store_name as profile_store_name,
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as profile_client_name,
    p.email as profile_email,
    nullif(
      trim(
        coalesce(
          pbi.payload ->> 'merchant_name',
          pbi.payload ->> 'merchantName',
          pbi.payload -> 'merchant' ->> 'name',
          pbi.payload ->> 'client_store_name',
          pbi.payload ->> 'store_name',
          pbi.payload ->> 'storeName',
          pbi.payload ->> 'client_name',
          pbi.payload ->> 'clientName',
          pbi.payload ->> 'name',
          pbi.payload ->> 'reference_id'
        )
      ),
      ''
    ) as prep_merchant_name
  from public.receiving_shipments rs
  left join public.companies c on c.id = rs.company_id
  left join public.profiles p on p.id = rs.user_id
  left join lateral (
    select payload
    from public.prep_business_imports pbi
    where pbi.receiving_shipment_id = rs.id
    order by pbi.created_at desc
    limit 1
  ) pbi on true
  cross join params prm
  where
    (
      prm.market_code is null
      or upper(coalesce(rs.warehouse_country, rs.destination_country, '')) = prm.market_code
    )
    and (
      (prm.status_filter is not null and lower(coalesce(rs.status, 'submitted')) = prm.status_filter)
      or (
        prm.status_filter is null
        and prm.include_archive = false
        and lower(coalesce(rs.status, 'submitted')) in ('submitted', 'partial')
      )
      or (
        prm.status_filter is null
        and prm.include_archive = true
        and lower(coalesce(rs.status, 'submitted')) in ('draft', 'submitted', 'partial', 'received', 'processed', 'cancelled')
      )
    )
    and (
      prm.search_text is null
      or lower(rs.id::text) like '%' || prm.search_text || '%'
      or replace(lower(rs.id::text), '-', '') like '%' || replace(prm.search_compact, '-', '') || '%'
      or lower(coalesce(rs.tracking_id, '')) like '%' || prm.search_compact || '%'
      or exists (
        select 1
        from unnest(coalesce(rs.tracking_ids, '{}'::text[])) as t(tracking_value)
        where lower(coalesce(t.tracking_value, '')) like '%' || prm.search_compact || '%'
      )
      or lower(coalesce(c.name, '')) like '%' || prm.search_text || '%'
      or lower(coalesce(p.store_name, '')) like '%' || prm.search_text || '%'
      or lower(coalesce(trim(concat_ws(' ', p.first_name, p.last_name)), '')) like '%' || prm.search_text || '%'
      or lower(coalesce(p.email, '')) like '%' || prm.search_text || '%'
      or exists (
        select 1
        from public.receiving_items ri
        left join public.stock_items si on si.id = ri.stock_item_id
        where ri.shipment_id = rs.id
          and (
            lower(coalesce(ri.sku, '')) like '%' || prm.search_compact || '%'
            or lower(coalesce(ri.ean_asin, '')) like '%' || prm.search_compact || '%'
            or lower(coalesce(ri.product_name, '')) like '%' || prm.search_text || '%'
            or lower(coalesce(si.asin, '')) like '%' || prm.search_compact || '%'
            or lower(coalesce(si.sku, '')) like '%' || prm.search_compact || '%'
            or lower(coalesce(si.ean, '')) like '%' || prm.search_compact || '%'
            or lower(coalesce(si.name, '')) like '%' || prm.search_text || '%'
          )
      )
      or exists (
        select 1
        from public.receiving_shipment_items rsi
        where rsi.shipment_id = rs.id
          and (
            lower(coalesce(rsi.asin, '')) like '%' || prm.search_compact || '%'
            or lower(coalesce(rsi.sku, '')) like '%' || prm.search_compact || '%'
            or lower(coalesce(rsi.ean, '')) like '%' || prm.search_compact || '%'
            or lower(coalesce(rsi.product_name, '')) like '%' || prm.search_text || '%'
          )
      )
    )
),
item_stats as (
  select
    ri.shipment_id,
    count(*)::int as modern_count,
    coalesce(sum(greatest(coalesce(ri.quantity_received, 0), 0)), 0)::int as modern_total_units,
    count(*) filter (
      where greatest(coalesce(ri.received_units, 0), 0) > 0
    )::int as any_received_count,
    count(*) filter (
      where
        greatest(coalesce(ri.quantity_received, 0), 0) <= 0
        or greatest(coalesce(ri.received_units, 0), 0) >= greatest(coalesce(ri.quantity_received, 0), 0)
    )::int as fully_received_count,
    coalesce(bool_or(coalesce(ri.send_to_fba, false) or coalesce(ri.fba_qty, 0) > 0), false) as has_item_fba,
    max(ev.created_at) as latest_event_at
  from public.receiving_items ri
  join shipment_base sb on sb.id = ri.shipment_id
  left join public.receiving_item_events ev on ev.receiving_item_id = ri.id
  group by ri.shipment_id
),
legacy_stats as (
  select
    rsi.shipment_id,
    count(*)::int as legacy_count,
    coalesce(
      sum(greatest(coalesce(rsi.quantity_received, rsi.quantity, rsi.requested, 0), 0)),
      0
    )::int as legacy_total_units
  from public.receiving_shipment_items rsi
  join shipment_base sb on sb.id = rsi.shipment_id
  group by rsi.shipment_id
),
combined as (
  select
    sb.id,
    sb.status,
    sb.created_at,
    sb.updated_at,
    sb.received_at,
    sb.processed_at,
    sb.destination_country,
    sb.warehouse_country,
    sb.carrier,
    sb.carrier_other,
    sb.tracking_id,
    sb.tracking_ids,
    sb.user_id,
    sb.profile_email as user_email,
    sb.company_name,
    coalesce(sb.prep_merchant_name, sb.profile_store_name, sb.profile_client_name, sb.company_name) as client_name,
    coalesce(sb.prep_merchant_name, sb.profile_store_name) as store_name,
    sb.prep_merchant_name,
    sb.import_source,
    sb.fba_mode,
    coalesce(item_stats.modern_count, 0) + coalesce(legacy_stats.legacy_count, 0) as line_count,
    coalesce(item_stats.modern_total_units, legacy_stats.legacy_total_units, 0) as total_units,
    (coalesce(sb.fba_mode, 'none') <> 'none' or coalesce(item_stats.has_item_fba, false)) as has_fba_intent,
    coalesce(item_stats.latest_event_at, sb.received_at, sb.updated_at, sb.created_at) as latest_received_at,
    case
      when lower(coalesce(sb.status, 'submitted')) in ('cancelled', 'processed') then lower(coalesce(sb.status, 'submitted'))
      when coalesce(item_stats.modern_count, 0) = 0 then lower(coalesce(sb.status, 'submitted'))
      when coalesce(item_stats.any_received_count, 0) = 0 then 'submitted'
      when coalesce(item_stats.fully_received_count, 0) = coalesce(item_stats.modern_count, 0)
        and coalesce(item_stats.any_received_count, 0) > 0 then 'received'
      else 'partial'
    end as computed_status
  from shipment_base sb
  left join item_stats on item_stats.shipment_id = sb.id
  left join legacy_stats on legacy_stats.shipment_id = sb.id
),
ranked as (
  select
    combined.*,
    count(*) over() as total_count,
    case
      when combined.computed_status = 'submitted' then 0
      when combined.computed_status = 'partial' then 1
      else 2
    end as sort_priority,
    row_number() over (
      order by
        case
          when combined.computed_status = 'submitted' then 0
          when combined.computed_status = 'partial' then 1
          else 2
        end asc,
        combined.latest_received_at desc,
        combined.created_at desc
    ) as row_num
  from combined
)
select
  ranked.id,
  ranked.status,
  ranked.computed_status,
  ranked.created_at,
  ranked.updated_at,
  ranked.received_at,
  ranked.processed_at,
  ranked.destination_country,
  ranked.warehouse_country,
  ranked.carrier,
  ranked.carrier_other,
  ranked.tracking_id,
  ranked.tracking_ids,
  ranked.user_id,
  ranked.user_email,
  ranked.company_name,
  ranked.client_name,
  ranked.store_name,
  ranked.prep_merchant_name,
  ranked.import_source,
  ranked.fba_mode,
  ranked.line_count,
  ranked.total_units,
  ranked.has_fba_intent,
  ranked.latest_received_at,
  ranked.total_count
from ranked
cross join params prm
where ranked.row_num > ((prm.page_number - 1) * prm.page_size)
  and ranked.row_num <= (prm.page_number * prm.page_size)
order by ranked.row_num asc;
$$;
