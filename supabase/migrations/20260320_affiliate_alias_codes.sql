create or replace function public.create_affiliate_alias(
  p_code text,
  p_label text default null,
  p_description text default null
)
returns public.affiliate_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  user_id uuid := auth.uid();
  template_code public.affiliate_codes%rowtype;
  created_code public.affiliate_codes%rowtype;
  normalized_code text := upper(trim(coalesce(p_code, '')));
begin
  if user_id is null then
    raise exception 'Not authenticated';
  end if;

  if normalized_code = '' then
    raise exception 'Code is required';
  end if;

  select *
  into template_code
  from public.affiliate_codes
  where owner_profile_id = user_id
    and active = true
  order by created_at asc
  limit 1;

  if template_code.id is null then
    raise exception 'Primary affiliate code not found';
  end if;

  insert into public.affiliate_codes (
    code,
    label,
    description,
    owner_profile_id,
    active,
    payout_type,
    percent_below_threshold,
    percent_above_threshold,
    threshold_amount,
    fixed_amount,
    payout_months_limit,
    payout_tiers
  )
  values (
    normalized_code,
    coalesce(nullif(trim(coalesce(p_label, '')), ''), template_code.label, normalized_code),
    coalesce(nullif(trim(coalesce(p_description, '')), ''), template_code.description),
    user_id,
    true,
    template_code.payout_type,
    template_code.percent_below_threshold,
    template_code.percent_above_threshold,
    template_code.threshold_amount,
    template_code.fixed_amount,
    template_code.payout_months_limit,
    template_code.payout_tiers
  )
  returning *
  into created_code;

  return created_code;
exception
  when unique_violation then
    raise exception 'Code already exists';
end;
$$;

grant execute on function public.create_affiliate_alias(text, text, text) to authenticated;

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
  user_id uuid := auth.uid();
  profile_row public.profiles%rowtype;
  primary_code_id uuid;
  v_company_id uuid;
  requested numeric := abs(coalesce(amount, 0));
  total_commission numeric := 0;
  used_credit numeric := 0;
  market_code text := upper(nullif(p_country, ''));
begin
  if user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into profile_row
  from public.profiles
  where id = user_id;

  if profile_row.id is null then
    raise exception 'Profile not found';
  end if;

  v_company_id := profile_row.company_id;
  if v_company_id is null then
    raise exception 'Missing company_id';
  end if;

  select id
  into primary_code_id
  from public.affiliate_codes
  where owner_profile_id = user_id
    and active = true
  order by created_at asc
  limit 1;

  if primary_code_id is null then
    raise exception 'Affiliate code not found';
  end if;

  if requested <= 0 then
    raise exception 'Invalid amount';
  end if;

  with owner_codes as (
    select *
    from public.affiliate_codes
    where owner_profile_id = user_id
      and active = true
  ),
  assigned as (
    select distinct
      p.company_id,
      oc.id as code_id,
      oc.payout_type,
      oc.percent_below_threshold,
      oc.percent_above_threshold,
      oc.threshold_amount,
      oc.fixed_amount,
      oc.payout_tiers
    from public.profiles p
    join public.affiliate_assignments aa
      on aa.profile_id = p.id
    join owner_codes oc
      on oc.id = aa.affiliate_code_id
    where p.company_id is not null
      and (market_code is null or upper(coalesce(aa.country, '')) = market_code)
  ),
  totals as (
    select
      inv.company_id,
      sum(coalesce(inv.amount, 0)) as billed
    from public.invoices inv
    where lower(coalesce(inv.status, '')) = 'paid'
      and (market_code is null or inv.country = market_code)
      and inv.company_id in (select company_id from assigned)
    group by inv.company_id
  )
  select coalesce(
    sum(
      public.compute_affiliate_commission(
        totals.billed,
        assigned.payout_type,
        assigned.percent_below_threshold,
        assigned.percent_above_threshold,
        assigned.threshold_amount,
        assigned.fixed_amount,
        assigned.payout_tiers
      )
    ),
    0
  )
  into total_commission
  from totals
  join assigned
    on assigned.company_id = totals.company_id;

  select coalesce(sum(abs(coalesce(o.total, 0))), 0)
  into used_credit
  from public.other_lines o
  where o.company_id = v_company_id
    and o.total < 0
    and (market_code is null or o.country = market_code)
    and (
      lower(coalesce(o.service, '')) like '%affiliate credit%'
      or exists (
        select 1
        from public.affiliate_codes oc
        where oc.owner_profile_id = user_id
          and o.obs_admin ilike ('affiliate_credit:' || oc.id || '%')
      )
    );

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
    v_company_id,
    'Affiliate credit applied',
    current_date,
    -requested,
    1,
    -requested,
    'affiliate_credit:' || primary_code_id,
    user_id,
    coalesce(market_code, 'FR')
  )
  returning id into other_line_id;

  applied := requested;
  remaining := available - requested;
  return next;
end;
$$;

grant execute on function public.redeem_affiliate_credit(numeric, text) to authenticated;
