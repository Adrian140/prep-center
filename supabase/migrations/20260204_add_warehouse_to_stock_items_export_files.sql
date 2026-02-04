-- Add warehouse column to stock_items and export_files for per-warehouse snapshots
alter table if exists public.stock_items
  add column if not exists warehouse text;

alter table if exists public.export_files
  add column if not exists warehouse text;
