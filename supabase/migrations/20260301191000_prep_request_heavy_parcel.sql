create table if not exists public.prep_request_heavy_parcel (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.prep_requests(id) on delete cascade,
  market text not null,
  heavy_boxes integer not null default 0,
  labels_count integer not null default 0,
  unit_price numeric(10,2) not null default 0.20,
  total_price numeric(10,2) not null default 0.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prep_request_heavy_parcel_market_check check (char_length(trim(market)) > 0),
  constraint prep_request_heavy_parcel_heavy_boxes_check check (heavy_boxes >= 0),
  constraint prep_request_heavy_parcel_labels_count_check check (labels_count >= 0)
);

create unique index if not exists idx_prep_request_heavy_parcel_request_market
  on public.prep_request_heavy_parcel (request_id, market);

create index if not exists idx_prep_request_heavy_parcel_request_id
  on public.prep_request_heavy_parcel (request_id);

alter table public.prep_request_heavy_parcel enable row level security;

drop policy if exists "Admins can manage all prep request heavy parcel" on public.prep_request_heavy_parcel;
create policy "Admins can manage all prep request heavy parcel"
  on public.prep_request_heavy_parcel
  as permissive
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users can manage company prep request heavy parcel" on public.prep_request_heavy_parcel;
create policy "Users can manage company prep request heavy parcel"
  on public.prep_request_heavy_parcel
  as permissive
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.prep_requests pr
      join public.profiles p on p.id = auth.uid()
      where pr.id = prep_request_heavy_parcel.request_id
        and pr.company_id = p.company_id
    )
  )
  with check (
    exists (
      select 1
      from public.prep_requests pr
      join public.profiles p on p.id = auth.uid()
      where pr.id = prep_request_heavy_parcel.request_id
        and pr.company_id = p.company_id
    )
  );
