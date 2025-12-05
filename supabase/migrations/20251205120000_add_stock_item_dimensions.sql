-- Add dimension and weight fields for stock items
alter table public.stock_items
  add column if not exists length_cm numeric,
  add column if not exists width_cm numeric,
  add column if not exists height_cm numeric,
  add column if not exists weight_kg numeric;

create index if not exists idx_stock_items_dimensions on public.stock_items (company_id, length_cm, width_cm, height_cm);
