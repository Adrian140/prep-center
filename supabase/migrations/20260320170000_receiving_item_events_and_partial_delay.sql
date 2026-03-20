create table if not exists public.receiving_item_events (
  id uuid primary key default gen_random_uuid(),
  receiving_item_id uuid not null references public.receiving_items(id) on delete cascade,
  shipment_id uuid not null references public.receiving_shipments(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  quantity_before integer not null default 0,
  quantity_delta integer not null,
  quantity_after integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_receiving_item_events_item_created_at
  on public.receiving_item_events (receiving_item_id, created_at desc);

create index if not exists idx_receiving_item_events_shipment_created_at
  on public.receiving_item_events (shipment_id, created_at desc);

alter table public.receiving_item_events
  enable row level security;

drop policy if exists "receiving_item_events_select_owner_or_admin" on public.receiving_item_events;
create policy "receiving_item_events_select_owner_or_admin"
  on public.receiving_item_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.receiving_shipments rs
      where rs.id = receiving_item_events.shipment_id
        and (
          rs.user_id = auth.uid()
          or public.is_admin()
        )
    )
  );

drop policy if exists "receiving_item_events_insert_owner_or_admin" on public.receiving_item_events;
create policy "receiving_item_events_insert_owner_or_admin"
  on public.receiving_item_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.receiving_shipments rs
      where rs.id = receiving_item_events.shipment_id
        and (
          rs.user_id = auth.uid()
          or public.is_admin()
        )
    )
  );

drop policy if exists "receiving_item_events_service_role_all" on public.receiving_item_events;
create policy "receiving_item_events_service_role_all"
  on public.receiving_item_events
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.log_receiving_item_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shipment_row public.receiving_shipments%rowtype;
  before_qty integer;
  after_qty integer;
  delta_qty integer;
begin
  after_qty := coalesce(new.received_units, 0);

  if tg_op = 'INSERT' then
    before_qty := 0;
    delta_qty := after_qty;
  else
    before_qty := coalesce(old.received_units, 0);
    delta_qty := after_qty - before_qty;
  end if;

  if delta_qty = 0 then
    return new;
  end if;

  select * into shipment_row
  from public.receiving_shipments
  where id = new.shipment_id;

  if shipment_row.id is null or shipment_row.company_id is null or shipment_row.user_id is null then
    return new;
  end if;

  insert into public.receiving_item_events (
    receiving_item_id,
    shipment_id,
    company_id,
    user_id,
    actor_id,
    quantity_before,
    quantity_delta,
    quantity_after,
    created_at
  )
  values (
    new.id,
    new.shipment_id,
    shipment_row.company_id,
    shipment_row.user_id,
    auth.uid(),
    before_qty,
    delta_qty,
    after_qty,
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_log_receiving_item_event on public.receiving_items;
create trigger trg_log_receiving_item_event
after insert or update of received_units
on public.receiving_items
for each row
execute function public.log_receiving_item_event();

create or replace function public.queue_reception_notification_from_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shipment_row public.receiving_shipments%rowtype;
  immediate boolean;
begin
  select * into shipment_row
  from public.receiving_shipments
  where id = new.shipment_id;

  if shipment_row.id is null or shipment_row.user_id is null or shipment_row.company_id is null then
    return new;
  end if;

  immediate := coalesce(shipment_row.status, '') in ('processed', 'received', 'cancelled');

  insert into public.reception_notification_queue (
    shipment_id,
    company_id,
    user_id,
    market,
    last_changed_at,
    due_at,
    force_send,
    updated_at
  )
  values (
    shipment_row.id,
    shipment_row.company_id,
    shipment_row.user_id,
    coalesce(shipment_row.warehouse_country, shipment_row.destination_country),
    now(),
    case when immediate then now() else now() + interval '30 minutes' end,
    immediate,
    now()
  )
  on conflict (shipment_id) do update
  set company_id = excluded.company_id,
      user_id = excluded.user_id,
      market = excluded.market,
      last_changed_at = excluded.last_changed_at,
      due_at = excluded.due_at,
      force_send = excluded.force_send,
      updated_at = now();

  return new;
end;
$$;

create or replace function public.queue_reception_notification_from_shipments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  immediate boolean;
begin
  if new.user_id is null or new.company_id is null then
    return new;
  end if;

  immediate := coalesce(new.status, '') in ('processed', 'received', 'cancelled');

  insert into public.reception_notification_queue (
    shipment_id,
    company_id,
    user_id,
    market,
    last_changed_at,
    due_at,
    force_send,
    updated_at
  )
  values (
    new.id,
    new.company_id,
    new.user_id,
    coalesce(new.warehouse_country, new.destination_country),
    now(),
    case when immediate then now() else now() + interval '30 minutes' end,
    immediate,
    now()
  )
  on conflict (shipment_id) do update
  set company_id = excluded.company_id,
      user_id = excluded.user_id,
      market = excluded.market,
      last_changed_at = excluded.last_changed_at,
      due_at = excluded.due_at,
      force_send = excluded.force_send,
      updated_at = now();

  return new;
end;
$$;
