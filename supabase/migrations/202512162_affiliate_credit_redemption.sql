-- Affiliate credit redemption helper functions

create or replace function public.compute_affiliate_commission(
  billed_total numeric,
  payout_type text,
  percent_below_threshold numeric,
  percent_above_threshold numeric,
  threshold_amount numeric,
  fixed_amount numeric,
  payout_tiers jsonb
)
returns numeric
language plpgsql
stable
as $$
declare
  total numeric := coalesce(billed_total, 0);
  percent numeric := coalesce(percent_below_threshold, percent_above_threshold, 0);
  threshold numeric := coalesce(threshold_amount, 0);
  percent_bonus numeric := coalesce(percent_above_threshold, percent_below_threshold, 0);
  fixed_bonus numeric := coalesce(fixed_amount, 0);
  tier jsonb;
  tier_min numeric;
  tier_percent numeric;
begin
  if total <= 0 then
    return 0;
  end if;

  if payout_type = 'threshold' then
    if threshold > 0 and total >= threshold then
      return (total * percent_bonus / 100) + fixed_bonus;
    end if;
    return total * percent / 100;
  end if;

  if jsonb_typeof(payout_tiers) = 'array' then
    for tier in
      select value
      from jsonb_array_elements(payout_tiers) as t(value)
      order by (value->>'min_amount')::numeric nulls last
    loop
      tier_min := nullif(tier->>'min_amount', '')::numeric;
      tier_percent := nullif(tier->>'percent', '')::numeric;
      if tier_min is not null and tier_percent is not null and total >= tier_min then
        percent := tier_percent;
      end if;
    end loop;
  end if;

  return total * percent / 100;
end;
$$;

create or replace function public.redeem_affiliate_credit(amount numeric)
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
    created_by
  )
  values (
    company_id,
    'Affiliate credit applied',
    current_date,
    -requested,
    1,
    -requested,
    'affiliate_credit:' || code_row.id,
    current_user
  )
  returning id into other_line_id;

  applied := requested;
  remaining := available - requested;
  return next;
end;
$$;

grant execute on function public.redeem_affiliate_credit(numeric) to authenticated;
