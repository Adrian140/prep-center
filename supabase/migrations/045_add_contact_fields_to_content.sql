-- 045_add_contact_fields_to_content.sql
-- Add editable contact/warehouse/company info fields to content table.

alter table if exists public.content
  add column if not exists company_info_name text,
  add column if not exists company_info_siret text,
  add column if not exists company_info_vat text,
  add column if not exists warehouse_name text,
  add column if not exists warehouse_address text,
  add column if not exists warehouse_phone text,
  add column if not exists warehouse_email text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists contact_address text;
