update public.stock_items
set asin = upper(trim(asin))
where asin is not null;

update public.stock_items
set sku = upper(trim(sku))
where sku is not null;

with duplicates as (
  select
    id,
    row_number() over (
      partition by company_id, upper(trim(asin)), upper(trim(sku))
      order by id
    ) as rn
  from public.stock_items
  where asin is not null
    and sku is not null
)
delete from public.stock_items s
using duplicates d
where s.id = d.id
  and d.rn > 1;

create unique index if not exists stock_items_company_sku_asin_key
  on public.stock_items (company_id, asin, sku)
  where asin is not null
    and sku is not null;
