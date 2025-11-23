/*
  # 046: Add tracking arrays to receiving shipments
  - allow multiple tracking IDs and FBA shipment IDs per receiving shipment
  - backfill tracking_ids with the existing tracking_id when missing
*/

ALTER TABLE IF EXISTS public.receiving_shipments
  ADD COLUMN IF NOT EXISTS tracking_ids TEXT[],
  ADD COLUMN IF NOT EXISTS fba_shipment_ids TEXT[];

UPDATE public.receiving_shipments
SET tracking_ids = ARRAY[tracking_id]
WHERE tracking_id IS NOT NULL
  AND COALESCE(cardinality(tracking_ids), 0) = 0;
