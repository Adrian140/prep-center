/*
  # Track confirmed received units per line

  - add `received_units` to `receiving_items`
  - backfill existing rows so fully received items keep their expected quantity
*/

ALTER TABLE public.receiving_items
  ADD COLUMN IF NOT EXISTS received_units INTEGER NOT NULL DEFAULT 0 CHECK (received_units >= 0);

UPDATE public.receiving_items
SET received_units = quantity_received
WHERE (received_units IS NULL OR received_units = 0)
  AND quantity_received IS NOT NULL;

ALTER TABLE public.receiving_items
  ALTER COLUMN received_units SET DEFAULT 0;
