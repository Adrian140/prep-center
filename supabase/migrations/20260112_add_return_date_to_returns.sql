-- Add back return_date column used by UI/exports and sort queries
alter table if exists public.returns
  add column if not exists return_date date;

-- Backfill existing rows
update public.returns
set return_date = coalesce(return_date, created_at::date);

-- Make it non-nullable going forward
alter table if exists public.returns
  alter column return_date set not null;

-- Index by company + date for faster filtering/ordering
create index if not exists returns_company_date_idx on public.returns (company_id, return_date);
