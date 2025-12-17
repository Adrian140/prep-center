-- Add notification preferences for client emails
alter table public.profiles
  add column if not exists notify_prep_shipments boolean not null default true;
