-- Store Qogita shipments locally to avoid repeated full fetches
create table if not exists public.qogita_shipment_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  order_qid text,
  shipment_code text,
  country text,
  tracking_links text[],
  gtin text,
  product_name text,
  shipped_qty int,
  requested_qty int,
  last_seen_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists qogita_shipment_lines_uidx on public.qogita_shipment_lines (user_id, shipment_code, gtin);
create index if not exists qogita_shipment_lines_user_idx on public.qogita_shipment_lines (user_id);
create index if not exists qogita_shipment_lines_gtin_idx on public.qogita_shipment_lines (gtin);

alter table public.qogita_shipment_lines enable row level security;

create policy qogita_shipments_self_select on public.qogita_shipment_lines
  for select using (auth.uid() = user_id);

create policy qogita_shipments_self_insert on public.qogita_shipment_lines
  for insert with check (auth.uid() = user_id);

create policy qogita_shipments_self_update on public.qogita_shipment_lines
  for update using (auth.uid() = user_id);

create policy qogita_shipments_self_delete on public.qogita_shipment_lines
  for delete using (auth.uid() = user_id);

create or replace function public.qogita_shipment_lines_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

create trigger trg_qogita_shipment_lines_updated
before update on public.qogita_shipment_lines
for each row execute function public.qogita_shipment_lines_set_updated_at();
