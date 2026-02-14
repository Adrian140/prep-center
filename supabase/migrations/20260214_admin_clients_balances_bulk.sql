create or replace function public.get_admin_clients_balances(
  p_company_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_prev_start_date date,
  p_prev_end_date date,
  p_country text default null
)
returns table (
  company_id uuid,
  current_sold numeric,
  carry numeric,
  live_balance numeric
)
language sql
stable
security definer
set search_path = public
as $$
with companies as (
  select distinct unnest(p_company_ids)::uuid as company_id
),
fba_current as (
  select
    f.company_id,
    sum(coalesce(f.total, f.unit_price * f.units)) as amount
  from public.fba_lines f
  join companies c on c.company_id = f.company_id
  where f.service_date between p_start_date and p_end_date
    and (
      p_country is null
      or upper(coalesce(f.country, '')) = upper(p_country)
    )
  group by f.company_id
),
fbm_current as (
  select
    f.company_id,
    sum(coalesce(f.total, f.unit_price * f.orders_units)) as amount
  from public.fbm_lines f
  join companies c on c.company_id = f.company_id
  where f.service_date between p_start_date and p_end_date
    and (
      p_country is null
      or upper(coalesce(f.country, '')) = upper(p_country)
    )
  group by f.company_id
),
other_current as (
  select
    o.company_id,
    sum(coalesce(o.total, o.unit_price * o.units)) as amount
  from public.other_lines o
  join companies c on c.company_id = o.company_id
  where o.service_date between p_start_date and p_end_date
    and (
      p_country is null
      or upper(coalesce(o.country, '')) = upper(p_country)
    )
  group by o.company_id
),
fba_prev as (
  select
    f.company_id,
    sum(coalesce(f.total, f.unit_price * f.units)) as amount
  from public.fba_lines f
  join companies c on c.company_id = f.company_id
  where f.service_date between p_prev_start_date and p_prev_end_date
    and (
      p_country is null
      or upper(coalesce(f.country, '')) = upper(p_country)
    )
  group by f.company_id
),
fbm_prev as (
  select
    f.company_id,
    sum(coalesce(f.total, f.unit_price * f.orders_units)) as amount
  from public.fbm_lines f
  join companies c on c.company_id = f.company_id
  where f.service_date between p_prev_start_date and p_prev_end_date
    and (
      p_country is null
      or upper(coalesce(f.country, '')) = upper(p_country)
    )
  group by f.company_id
),
other_prev as (
  select
    o.company_id,
    sum(coalesce(o.total, o.unit_price * o.units)) as amount
  from public.other_lines o
  join companies c on c.company_id = o.company_id
  where o.service_date between p_prev_start_date and p_prev_end_date
    and (
      p_country is null
      or upper(coalesce(o.country, '')) = upper(p_country)
    )
  group by o.company_id
),
invoices_prev as (
  select
    i.company_id,
    sum(i.amount) as amount
  from public.invoices i
  join companies c on c.company_id = i.company_id
  where i.issue_date between p_prev_start_date and p_prev_end_date
    and lower(coalesce(i.status, '')) in ('paid', 'settled')
    and (
      p_country is null
      or upper(coalesce(i.country, '')) = upper(p_country)
    )
  group by i.company_id
),
fba_all as (
  select
    f.company_id,
    sum(coalesce(f.total, f.unit_price * f.units)) as amount
  from public.fba_lines f
  join companies c on c.company_id = f.company_id
  where (
    p_country is null
    or upper(coalesce(f.country, '')) = upper(p_country)
  )
  group by f.company_id
),
fbm_all as (
  select
    f.company_id,
    sum(coalesce(f.total, f.unit_price * f.orders_units)) as amount
  from public.fbm_lines f
  join companies c on c.company_id = f.company_id
  where (
    p_country is null
    or upper(coalesce(f.country, '')) = upper(p_country)
  )
  group by f.company_id
),
other_all as (
  select
    o.company_id,
    sum(coalesce(o.total, o.unit_price * o.units)) as amount
  from public.other_lines o
  join companies c on c.company_id = o.company_id
  where (
    p_country is null
    or upper(coalesce(o.country, '')) = upper(p_country)
  )
  group by o.company_id
),
invoices_paid_all as (
  select
    i.company_id,
    sum(i.amount) as amount
  from public.invoices i
  join companies c on c.company_id = i.company_id
  where lower(coalesce(i.status, '')) in ('paid', 'settled')
    and (
      p_country is null
      or upper(coalesce(i.country, '')) = upper(p_country)
    )
  group by i.company_id
)
select
  c.company_id,
  coalesce(fc.amount, 0) + coalesce(fmc.amount, 0) + coalesce(oc.amount, 0) as current_sold,
  (coalesce(fp.amount, 0) + coalesce(fmp.amount, 0) + coalesce(op.amount, 0)) - coalesce(ip.amount, 0) as carry,
  (coalesce(fa.amount, 0) + coalesce(fma.amount, 0) + coalesce(oa.amount, 0)) - coalesce(ipa.amount, 0) as live_balance
from companies c
left join fba_current fc on fc.company_id = c.company_id
left join fbm_current fmc on fmc.company_id = c.company_id
left join other_current oc on oc.company_id = c.company_id
left join fba_prev fp on fp.company_id = c.company_id
left join fbm_prev fmp on fmp.company_id = c.company_id
left join other_prev op on op.company_id = c.company_id
left join invoices_prev ip on ip.company_id = c.company_id
left join fba_all fa on fa.company_id = c.company_id
left join fbm_all fma on fma.company_id = c.company_id
left join other_all oa on oa.company_id = c.company_id
left join invoices_paid_all ipa on ipa.company_id = c.company_id;
$$;

grant execute on function public.get_admin_clients_balances(uuid[], date, date, date, date, text) to authenticated;
