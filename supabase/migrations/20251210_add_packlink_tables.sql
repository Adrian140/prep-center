-- Packlink integration tables
create extension if not exists "pgcrypto";

create table if not exists public.packlink_shipments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  packlink_id text not null unique,
  status text not null default 'pending',
  carrier text,
  tracking_number text,
  label_url text,
  price numeric,
  service_id text,
  from_address jsonb,
  to_address jsonb,
  parcel jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists packlink_shipments_user_id_idx on public.packlink_shipments(user_id);
create index if not exists packlink_shipments_status_idx on public.packlink_shipments(status);
create index if not exists packlink_shipments_tracking_idx on public.packlink_shipments(tracking_number);

create or replace function public.set_packlink_shipments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists packlink_shipments_set_updated_at on public.packlink_shipments;
create trigger packlink_shipments_set_updated_at
before update on public.packlink_shipments
for each row execute function public.set_packlink_shipments_updated_at();

alter table public.packlink_shipments enable row level security;

create policy "packlink_shipments_select_own"
  on public.packlink_shipments
  for select
  using (auth.uid() = user_id);

create policy "packlink_shipments_insert_own"
  on public.packlink_shipments
  for insert
  with check (auth.uid() = user_id);

create policy "packlink_shipments_update_own"
  on public.packlink_shipments
  for update
  using (auth.uid() = user_id);

create policy "packlink_shipments_service_role_all"
  on public.packlink_shipments
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.packlink_webhooks (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.packlink_shipments(id) on delete set null,
  event text,
  payload jsonb,
  received_at timestamptz default now()
);

create index if not exists packlink_webhooks_shipment_id_idx on public.packlink_webhooks(shipment_id);
create index if not exists packlink_webhooks_packlink_id_idx on public.packlink_webhooks((payload ->> 'id'));

alter table public.packlink_webhooks enable row level security;

create policy "packlink_webhooks_service_role_all"
  on public.packlink_webhooks
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "packlink_webhooks_select_owner"
  on public.packlink_webhooks
  for select
  using (
    exists (
      select 1 from public.packlink_shipments s
      where s.id = packlink_webhooks.shipment_id
        and s.user_id = auth.uid()
    )
  );
