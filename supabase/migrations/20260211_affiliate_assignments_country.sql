-- Per-country affiliate assignments and country-aware credit redemption

create table if not exists public.affiliate_assignments (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  country text not null,
  affiliate_code_id uuid references public.affiliate_codes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliate_assignments_unique unique (profile_id, country)
);

create index if not exists affiliate_assignments_profile_country_idx
  on public.affiliate_assignments (profile_id, country);

create index if not exists affiliate_assignments_code_idx
  on public.affiliate_assignments (affiliate_code_id);

create or replace function public.ensure_affiliate_assignment(
  p_profile_id uuid,
  p_country text,
  p_code text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  norm_country text := upper(trim(coalesce(p_country, '')));
  code_text text;
  code_id uuid;
begin
  if p_profile_id is null or norm_country = '' then
    return;
  end if;

  if p_code is not null and trim(p_code) <> '' then
    code_text := upper(trim(p_code));
  end if;

  if code_text is null then
    select coalesce(ac.code, p.affiliate_code_input) into code_text
    from public.profiles p
    left join public.affiliate_codes ac on ac.id = p.affiliate_code_id
    where p.id = p_profile_id;
  end if;

  if code_text is null or trim(code_text) = '' then
    return;
  end if;

  select id into code_id from public.affiliate_codes where code = upper(trim(code_text)) and active = true limit 1;
  if code_id is null then
    return;
  end if;

  insert into public.affiliate_assignments (profile_id, country, affiliate_code_id)
  values (p_profile_id, norm_country, code_id)
  on conflict (profile_id, country) do update
    set affiliate_code_id = excluded.affiliate_code_id,
        updated_at = now();
end;
$$;

create or replace function public.sync_affiliate_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c text;
begin
  -- primary country
  perform public.ensure_affiliate_assignment(new.id, new.country, coalesce(new.affiliate_code_input, null));

  -- allowed markets array
  if new.allowed_markets is not null then
    foreach c in array new.allowed_markets loop
      perform public.ensure_affiliate_assignment(new.id, c, coalesce(new.affiliate_code_input, null));
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_affiliate_assign on public.profiles;
create trigger trg_profiles_affiliate_assign
after insert or update of affiliate_code_input, affiliate_code_id, allowed_markets, country
on public.profiles
for each row
execute function public.sync_affiliate_assignments();

-- Replace redeem_affiliate_credit to respect country-specific assignments
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

  with assigned as (
    select distinct p.company_id
    from public.profiles p
    join public.affiliate_assignments aa
      on aa.profile_id = p.id
     and aa.affiliate_code_id = code_row.id
    where p.company_id is not null
      and (market_code is null or upper(coalesce(aa.country, '')) = market_code)
  )
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
      and inv.company_id in (select company_id from assigned)
      and (market_code is null or inv.country = market_code)
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

grant execute on function public.ensure_affiliate_assignment(uuid, text, text) to authenticated;
grant execute on function public.redeem_affiliate_credit(numeric, text) to authenticated;

-- Backfill assignments for existing profiles
insert into public.affiliate_assignments (profile_id, country, affiliate_code_id)
select p.id,
       upper(trim(coalesce(country, 'FR'))),
       ac.id
from public.profiles p
left join public.affiliate_codes ac on ac.id = p.affiliate_code_id
where ac.id is not null
on conflict (profile_id, country) do nothing;

-- Backfill for allowed_markets array
insert into public.affiliate_assignments (profile_id, country, affiliate_code_id)
select p.id,
       upper(trim(unnest(p.allowed_markets))),
       ac.id
from public.profiles p
left join public.affiliate_codes ac on ac.id = p.affiliate_code_id
where ac.id is not null
  and p.allowed_markets is not null
on conflict (profile_id, country) do nothing;
