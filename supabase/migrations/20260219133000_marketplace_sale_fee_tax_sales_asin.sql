-- Make finalized marketplace sale fee visible as "Tax sales" and include sold ASIN.

create or replace function public.client_market_finalize_sale(
  p_listing_id uuid,
  p_units integer default null
)
returns public.client_market_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.client_market_listings;
  v_units integer;
  v_obs text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into v_listing
  from public.client_market_listings
  where id = p_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'Listing not found';
  end if;

  if v_listing.owner_user_id <> v_uid then
    raise exception 'Not allowed';
  end if;

  if coalesce(v_listing.is_active, false) = false then
    return v_listing;
  end if;

  v_units := greatest(1, coalesce(p_units, v_listing.quantity, 1));
  v_obs := concat(
    'ASIN sold: ', coalesce(nullif(trim(v_listing.asin), ''), '-'),
    ' | Listing: ', v_listing.id::text
  );

  insert into public.fba_lines (
    company_id,
    service,
    service_date,
    unit_price,
    units,
    obs_admin,
    created_by,
    user_id
  )
  values (
    coalesce(v_listing.owner_company_id, v_uid),
    'Tax sales',
    current_date,
    0.05,
    v_units,
    v_obs,
    v_uid,
    v_uid
  );

  update public.client_market_listings
     set is_active = false,
         sale_finalized_at = now(),
         sale_finalized_units = v_units,
         updated_at = now()
   where id = v_listing.id
   returning * into v_listing;

  return v_listing;
end;
$$;

-- Backfill old rows: rename service and append sold ASIN where we can resolve listing id.
with candidate as (
  select
    f.id,
    f.obs_admin,
    (regexp_match(f.obs_admin, 'Listing:\\s*([0-9a-fA-F-]{36})'))[1]::uuid as listing_id
  from public.fba_lines f
  where f.service = 'Marketplace sale fee'
    and f.obs_admin ilike '%Listing:%'
)
update public.fba_lines f
set
  service = 'Tax sales',
  obs_admin = concat(
    'ASIN sold: ', coalesce(nullif(trim(cml.asin), ''), '-'),
    ' | Listing: ', cml.id::text
  )
from candidate c
join public.client_market_listings cml on cml.id = c.listing_id
where f.id = c.id;

-- Rename remaining rows even if listing id is missing/unparseable.
update public.fba_lines
set service = 'Tax sales'
where service = 'Marketplace sale fee';
