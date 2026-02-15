alter table if exists public.invoices
  add column if not exists document_type text not null default 'invoice',
  add column if not exists converted_to_invoice_id uuid null,
  add column if not exists converted_from_proforma_id uuid null,
  add column if not exists billing_invoice_id uuid null,
  add column if not exists document_payload jsonb null;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_document_type_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_document_type_check
      CHECK (document_type IN ('invoice', 'proforma'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_converted_to_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_converted_to_invoice_id_fkey
      FOREIGN KEY (converted_to_invoice_id)
      REFERENCES public.invoices(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_converted_from_proforma_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_converted_from_proforma_id_fkey
      FOREIGN KEY (converted_from_proforma_id)
      REFERENCES public.invoices(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_billing_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_billing_invoice_id_fkey
      FOREIGN KEY (billing_invoice_id)
      REFERENCES public.billing_invoices(id)
      ON DELETE SET NULL;
  END IF;
END $$;

create index if not exists invoices_document_type_idx on public.invoices(document_type);
create index if not exists invoices_converted_to_invoice_id_idx on public.invoices(converted_to_invoice_id);
create index if not exists invoices_converted_from_proforma_id_idx on public.invoices(converted_from_proforma_id);
