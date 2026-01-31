alter table if exists public.prep_requests
  add column if not exists step1_box_plan jsonb default '{}'::jsonb;
