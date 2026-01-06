-- Track Amazon inbound plan + placement identifiers
alter table public.prep_requests
  add column if not exists inbound_plan_id text,
  add column if not exists placement_option_id text;

create index if not exists prep_requests_inbound_plan_id_idx on public.prep_requests (inbound_plan_id);
create index if not exists prep_requests_placement_option_id_idx on public.prep_requests (placement_option_id);
