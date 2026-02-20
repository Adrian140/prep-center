alter table public.affiliate_codes
  add column if not exists payout_months_limit integer;

alter table public.affiliate_codes
  drop constraint if exists affiliate_codes_payout_months_limit_check;

alter table public.affiliate_codes
  add constraint affiliate_codes_payout_months_limit_check
  check (payout_months_limit is null or payout_months_limit > 0);
