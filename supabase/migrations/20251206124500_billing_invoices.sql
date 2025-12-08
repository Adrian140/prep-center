-- Migration: add billing invoice metadata and links for admin selections
create table if not exists public.billing_invoices (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  invoice_number text not null,
  invoice_date date not null,
  total_amount numeric(12,2) not null default 0,
  notes text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.billing_invoices
  add constraint billing_invoices_pkey primary key (id);

alter table public.billing_invoices enable row level security;

create unique index if not exists billing_invoices_company_invoice_unique
  on public.billing_invoices (company_id, invoice_number);

alter table public.fba_lines
  add column if not exists billing_invoice_id uuid references public.billing_invoices(id) on delete set null;
alter table public.fbm_lines
  add column if not exists billing_invoice_id uuid references public.billing_invoices(id) on delete set null;
alter table public.other_lines
  add column if not exists billing_invoice_id uuid references public.billing_invoices(id) on delete set null;

create index if not exists idx_fba_lines_billing_invoice_id
  on public.fba_lines (billing_invoice_id);
create index if not exists idx_fbm_lines_billing_invoice_id
  on public.fbm_lines (billing_invoice_id);
create index if not exists idx_other_lines_billing_invoice_id
  on public.other_lines (billing_invoice_id);

-- Policies for billing invoices (admin + company owners)
create policy "billing invoices admin select"
  on public.billing_invoices
  as permissive
  for select
  to authenticated
using (public.e_admin());

create policy "billing invoices admin insert"
  on public.billing_invoices
  as permissive
  for insert
  to authenticated
with check (public.e_admin());

create policy "billing invoices admin update"
  on public.billing_invoices
  as permissive
  for update
  to authenticated
using (public.e_admin())
with check (public.e_admin());

create policy "billing invoices admin delete"
  on public.billing_invoices
  as permissive
  for delete
  to authenticated
using (public.e_admin());

create policy "billing invoices clients select own"
  on public.billing_invoices
  as permissive
  for select
  to authenticated
using (company_id = public.current_company_id());

create policy "billing invoices service role full access"
  on public.billing_invoices
  as permissive
  for all
  to service_role
using (true)
with check (true);

create policy "billing invoices supabase admin full access"
  on public.billing_invoices
  as permissive
  for all
  to supabase_admin
using (true)
with check (true);

-- Grant privileges to system roles
grant select, insert, update, delete on public.billing_invoices to service_role;
grant select, insert, update, delete on public.billing_invoices to supabase_admin;
grant select, insert, update, delete on public.billing_invoices to supabase_auth_admin;
