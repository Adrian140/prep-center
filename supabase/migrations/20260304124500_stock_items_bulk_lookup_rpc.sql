begin;

create or replace function public.lookup_stock_items_bulk(
  p_ids bigint[] default null,
  p_asins text[] default null,
  p_skus text[] default null,
  p_eans text[] default null,
  p_company_id uuid default null
)
returns table (
  id bigint,
  asin text,
  name text,
  sku text,
  ean text,
  image_url text
)
language sql
security invoker
set search_path = public
as $$
  with ids as (
    select distinct v as id
    from unnest(coalesce(p_ids, array[]::bigint[])) as v
    where v is not null
  ),
  asins as (
    select distinct trim(v) as asin
    from unnest(coalesce(p_asins, array[]::text[])) as v
    where v is not null and btrim(v) <> ''
  ),
  skus as (
    select distinct trim(v) as sku
    from unnest(coalesce(p_skus, array[]::text[])) as v
    where v is not null and btrim(v) <> ''
  ),
  eans as (
    select distinct trim(v) as ean
    from unnest(coalesce(p_eans, array[]::text[])) as v
    where v is not null and btrim(v) <> ''
  ),
  unioned as (
    select si.id, si.asin, si.name, si.sku, si.ean, si.image_url
    from public.stock_items si
    join ids i on si.id = i.id
    where p_company_id is null or si.company_id = p_company_id

    union

    select si.id, si.asin, si.name, si.sku, si.ean, si.image_url
    from public.stock_items si
    join asins a on si.asin = a.asin
    where p_company_id is null or si.company_id = p_company_id

    union

    select si.id, si.asin, si.name, si.sku, si.ean, si.image_url
    from public.stock_items si
    join skus s on si.sku = s.sku
    where p_company_id is null or si.company_id = p_company_id

    union

    select si.id, si.asin, si.name, si.sku, si.ean, si.image_url
    from public.stock_items si
    join eans e on si.ean = e.ean
    where p_company_id is null or si.company_id = p_company_id
  )
  select distinct u.id, u.asin, u.name, u.sku, u.ean, u.image_url
  from unioned u;
$$;

revoke all on function public.lookup_stock_items_bulk(bigint[], text[], text[], text[], uuid) from public;
grant execute on function public.lookup_stock_items_bulk(bigint[], text[], text[], text[], uuid) to authenticated;
grant execute on function public.lookup_stock_items_bulk(bigint[], text[], text[], text[], uuid) to service_role;

commit;
