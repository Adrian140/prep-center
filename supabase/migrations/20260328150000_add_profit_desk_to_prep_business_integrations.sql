alter table if exists public.prep_business_integrations
  add column if not exists email_profit_desk text;

alter table if exists public.prep_business_integrations
  add column if not exists profit_desk_token_id text;

create index if not exists idx_prep_business_integrations_email_profit_desk
  on public.prep_business_integrations (email_profit_desk);

create index if not exists idx_prep_business_integrations_profit_desk_token_id
  on public.prep_business_integrations (profit_desk_token_id);
