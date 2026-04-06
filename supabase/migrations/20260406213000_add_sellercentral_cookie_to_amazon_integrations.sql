alter table if exists public.amazon_integrations
  add column if not exists sellercentral_cookie text;
