-- Map EAN <-> ASIN per user/company
create table if not exists public.asin_eans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  company_id uuid,
  asin text not null,
  ean text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists asin_eans_uidx on public.asin_eans (user_id, asin, ean);
create index if not exists asin_eans_asin_idx on public.asin_eans (asin);
create index if not exists asin_eans_ean_idx on public.asin_eans (ean);

alter table public.asin_eans enable row level security;

create policy asin_eans_self_select on public.asin_eans
  for select using (auth.uid() = user_id);
create policy asin_eans_self_insert on public.asin_eans
  for insert with check (auth.uid() = user_id);
create policy asin_eans_self_update on public.asin_eans
  for update using (auth.uid() = user_id);
create policy asin_eans_self_delete on public.asin_eans
  for delete using (auth.uid() = user_id);
