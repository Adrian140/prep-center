-- Track selected transportation option id for inbound plan confirmations
alter table public.prep_requests
  add column if not exists transportation_option_id text;

create index if not exists prep_requests_transportation_option_id_idx
  on public.prep_requests (transportation_option_id);
