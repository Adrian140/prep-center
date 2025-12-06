update public.stock_items
set asin = upper(trim(asin))
where asin is not null;

update public.stock_items
set sku = upper(trim(sku))
where sku is not null;

-- Merge duplicate rows (same company_id + ASIN + SKU) instead of blindly deleting them.
-- Business rules:
--  - keep a single "master" row per (company_id, asin, sku)
--  - accumulate manual/prep qty into the master
--  - preserve an existing image_url on the master, or take one from duplicates if master has none
--  - reattach any product_images rows to the master stock_item_id
do $$
begin
  -- Temp mapping of duplicate rows to their chosen master.
  create temporary table if not exists tmp_stock_items_mapping on commit drop as
  with normalized as (
    select
      id,
      company_id,
      upper(trim(asin)) as asin_norm,
      upper(trim(sku))  as sku_norm,
      qty,
      image_url,
      row_number() over (
        partition by company_id, upper(trim(asin)), upper(trim(sku))
        -- Prefer rows with higher qty, then ones that already have an image_url, then lowest id.
        order by
          coalesce(qty, 0) desc,
          (case when image_url is not null and btrim(image_url) <> '' then 0 else 1 end),
          id
      ) as rn
    from public.stock_items
    where asin is not null
      and sku is not null
  ),
  mapping as (
    select
      d.id  as dup_id,
      m.id  as master_id
    from normalized d
    join normalized m
      on m.company_id = d.company_id
     and m.asin_norm   = d.asin_norm
     and m.sku_norm    = d.sku_norm
     and m.rn          = 1
    where d.rn > 1
  )
  select * from mapping;

  -- If there are no duplicates, nothing else to do.
  if not exists (select 1 from tmp_stock_items_mapping) then
    return;
  end if;

  -- Aggregate qty and "best" image_url from duplicates per master.
  create temporary table if not exists tmp_stock_items_agg on commit drop as
  select
    m.master_id,
    sum(coalesce(s.qty, 0)) as dup_qty_sum,
    max(nullif(btrim(s.image_url), '')) as dup_best_image
  from tmp_stock_items_mapping m
  join public.stock_items s
    on s.id = m.dup_id
  group by m.master_id;

  -- 1) Update master rows: add duplicate qty and fill missing image_url from duplicates.
  update public.stock_items s
  set
    qty = greatest(0, coalesce(s.qty, 0) + coalesce(a.dup_qty_sum, 0)),
    image_url = coalesce(
      nullif(btrim(s.image_url), ''),
      a.dup_best_image,
      s.image_url
    )
  from tmp_stock_items_agg a
  where s.id = a.master_id;

  -- 2) Reattach product_images rows from duplicates to their master stock_item_id.
  update public.product_images pi
  set stock_item_id = m.master_id
  from tmp_stock_items_mapping m
  where pi.stock_item_id = m.dup_id;

  -- 3) Delete duplicate stock_items rows now that data has been merged.
  delete from public.stock_items s
  using tmp_stock_items_mapping m
  where s.id = m.dup_id;
end
$$;

create unique index if not exists stock_items_company_sku_asin_key
  on public.stock_items (company_id, asin, sku)
  where asin is not null
    and sku is not null;
