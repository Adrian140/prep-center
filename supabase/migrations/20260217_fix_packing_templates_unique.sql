-- Ensure one packing template per (company, marketplace, sku, name)
-- and keep the most recently updated row when duplicates exist.

with ranked as (
  select
    id,
    row_number() over (
      partition by company_id, marketplace_id, sku, name
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.packing_templates
)
delete from public.packing_templates p
using ranked r
where p.id = r.id
  and r.rn > 1;

create unique index if not exists packing_templates_company_market_sku_name_uidx
  on public.packing_templates (company_id, marketplace_id, sku, name);
