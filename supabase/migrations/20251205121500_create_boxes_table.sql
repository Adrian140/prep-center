create table if not exists public.boxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  length_cm numeric,
  width_cm numeric,
  height_cm numeric,
  max_kg numeric,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_boxes_dims on public.boxes (length_cm, width_cm, height_cm);

create trigger set_timestamp_boxes
before update on public.boxes
for each row
execute procedure public.set_current_timestamp_updated_at();
