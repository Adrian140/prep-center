/*
  # Add additional carriers

  - Adds ColisPrive, Amazon Logistics and eLogistics to carriers dropdown
*/

BEGIN;

INSERT INTO public.carriers (name, code, sort_order, active)
VALUES
  ('ColisPrive', 'COLISPRIVE', 7, true),
  ('Amazon Logistics', 'AMAZON', 8, true),
  ('eLogistics', 'ELOGISTICS', 9, true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      active = EXCLUDED.active;

COMMIT;

