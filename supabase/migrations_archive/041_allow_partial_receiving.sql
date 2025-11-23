/*
  # Support partial receiving per line
  1. Allow the `receiving_shipments.status` column to store the new `partial` state.
  2. Track which receiving lines have been confirmed (and by whom/when).
*/

-- Extend status check to allow `partial`
ALTER TABLE public.receiving_shipments
  DROP CONSTRAINT IF EXISTS receiving_shipments_status_check;

ALTER TABLE public.receiving_shipments
  ADD CONSTRAINT receiving_shipments_status_check
  CHECK (
    status IN ('draft','submitted','partial','received','processed','cancelled')
  );

-- Track confirmation on each line
ALTER TABLE public.receiving_items
  ADD COLUMN IF NOT EXISTS is_received BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receiving_items_is_received
  ON public.receiving_items (shipment_id, is_received);
