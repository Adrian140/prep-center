alter table public.client_market_listings
  add column if not exists sale_finalized_at timestamptz,
  add column if not exists sale_finalized_units integer;

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
    'Marketplace sale fee',
    current_date,
    0.05,
    v_units,
    concat('Client marketplace sale finalized. Listing: ', v_listing.id::text),
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

revoke all on function public.client_market_finalize_sale(uuid, integer) from public;
grant execute on function public.client_market_finalize_sale(uuid, integer) to authenticated;
grant execute on function public.client_market_finalize_sale(uuid, integer) to service_role;
