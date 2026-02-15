alter table public.profiles
  add column if not exists notify_reception_updates boolean not null default true,
  add column if not exists notify_reception_push boolean not null default false;

create table if not exists public.reception_notification_queue (
  shipment_id uuid primary key references public.receiving_shipments(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  market text,
  last_changed_at timestamptz not null default now(),
  due_at timestamptz,
  force_send boolean not null default false,
  last_sent_at timestamptz,
  last_sent_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reception_notification_queue_due_at
  on public.reception_notification_queue (due_at)
  where due_at is not null;

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
    case when immediate then now() else now() + interval '1 hour' end,
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

drop trigger if exists trg_queue_reception_notification_from_items on public.receiving_items;
create trigger trg_queue_reception_notification_from_items
after insert or update of quantity_received, received_units, is_received, updated_at
on public.receiving_items
for each row
execute function public.queue_reception_notification_from_items();

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
    case when immediate then now() else now() + interval '1 hour' end,
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

drop trigger if exists trg_queue_reception_notification_from_shipments on public.receiving_shipments;
create trigger trg_queue_reception_notification_from_shipments
after insert or update of status, updated_at
on public.receiving_shipments
for each row
execute function public.queue_reception_notification_from_shipments();
