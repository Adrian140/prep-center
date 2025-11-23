/*
  # Extend prep request boxes with weight and dimensions

  Adds weight (kg) and three dimension columns (cm) for each box entry so admins
  can keep packaging info alongside units.
*/

BEGIN;

ALTER TABLE public.prep_request_boxes
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS length_cm NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS width_cm NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(8,2);

COMMIT;
