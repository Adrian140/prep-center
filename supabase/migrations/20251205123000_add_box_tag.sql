alter table public.boxes
  add column if not exists tag text default 'standard';

create index if not exists idx_boxes_tag on public.boxes (tag);
