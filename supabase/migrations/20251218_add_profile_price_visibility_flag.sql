-- Add per-profile toggle for exposing pricing to specific clients
alter table public.profiles
  add column if not exists can_view_prices boolean not null default false;
