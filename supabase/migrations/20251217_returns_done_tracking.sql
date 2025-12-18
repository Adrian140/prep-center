-- Track return completion time and stock adjustment flag
alter table public.returns
  add column if not exists done_at timestamptz,
  add column if not exists stock_adjusted boolean not null default false;
