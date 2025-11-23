/*
  # Prep Request Boxes

  Stores per-box allocations for each prep request item so admins can keep a shipping
  summary and reuse it after reloads/confirmations.
*/

create table if not exists public.prep_request_boxes (
  id uuid primary key default gen_random_uuid(),
  prep_request_item_id uuid references public.prep_request_items(id) on delete cascade,
  box_number integer not null check (box_number >= 1),
  units integer not null check (units >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists prep_request_boxes_item_box_idx
  on public.prep_request_boxes(prep_request_item_id, box_number);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists prep_request_boxes_touch on public.prep_request_boxes;
create trigger prep_request_boxes_touch
  before update on public.prep_request_boxes
  for each row execute function public.touch_updated_at();

alter table public.prep_request_boxes enable row level security;

create policy "Admins can manage prep request boxes"
  on public.prep_request_boxes
  for all
  using (is_admin())
  with check (is_admin());

grant select, insert, update, delete on public.prep_request_boxes
  to supabase_admin, supabase_auth_admin, service_role;
