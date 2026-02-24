alter table if exists public.prep_business_integrations
  add column if not exists profit_path_token_id text;

create index if not exists idx_prep_business_integrations_profit_path_token_id
  on public.prep_business_integrations (profit_path_token_id);
