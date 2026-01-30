create or replace function public.redeem_affiliate_credit(amount numeric, p_country text default null)
returns table (
  applied numeric,
  available numeric,
  remaining numeric,
  other_line_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user uuid := auth.uid();
  profile_row public.profiles%rowtype;
  code_row public.affiliate_codes%rowtype;
  company_id uuid;
  requested numeric := abs(coalesce(amount, 0));
  total_commission numeric := 0;
  used_credit numeric := 0;
  market_code text := upper(nullif(p_country, ''));
begin
  if current_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into profile_row
  from public.profiles
  where id = current_user;

  if profile_row.id is null then
    raise exception 'Profile not found';
  end if;

  company_id := profile_row.company_id;
  if company_id is null then
    raise exception 'Missing company_id';
  end if;

  select * into code_row
  from public.affiliate_codes
  where owner_profile_id = current_user;

  if code_row.id is null then
    raise exception 'Affiliate code not found';
  end if;

  if requested <= 0 then
    raise exception 'Invalid amount';
  end if;

  select coalesce(
    sum(
      public.compute_affiliate_commission(
        totals.billed,
        code_row.payout_type,
        code_row.percent_below_threshold,
        code_row.percent_above_threshold,
        code_row.threshold_amount,
        code_row.fixed_amount,
        code_row.payout_tiers
      )
    ),
    0
  )
  into total_commission
  from (
    select inv.company_id,
           sum(coalesce(inv.amount, 0)) as billed
    from public.invoices inv
    where lower(coalesce(inv.status, '')) = 'paid'
      and (market_code is null or inv.country = market_code)
      and inv.company_id in (
        select distinct p.company_id
        from public.profiles p
        where p.affiliate_code_id = code_row.id
          and p.company_id is not null
      )
    group by inv.company_id
  ) totals;

  select coalesce(sum(abs(coalesce(o.total, 0))), 0)
  into used_credit
  from public.other_lines o
  where o.company_id = company_id
    and o.total < 0
    and (market_code is null or o.country = market_code)
    and o.obs_admin ilike ('affiliate_credit:' || code_row.id || '%');

  available := greatest(total_commission - used_credit, 0);
  if available <= 0 then
    raise exception 'No available credit';
  end if;

  if requested > available then
    raise exception 'Amount exceeds available credit';
  end if;

  insert into public.other_lines (
    company_id,
    service,
    service_date,
    unit_price,
    units,
    total,
    obs_admin,
    created_by,
    country
  )
  values (
    company_id,
    'Affiliate credit applied',
    current_date,
    -requested,
    1,
    -requested,
    'affiliate_credit:' || code_row.id,
    current_user,
    coalesce(market_code, 'FR')
  )
  returning id into other_line_id;

  applied := requested;
  remaining := available - requested;
  return next;
end;
$$;

grant execute on function public.redeem_affiliate_credit(numeric, text) to authenticated;
