/*
  # 047: Align RLS for legacy receiving items
  - ensure the legacy `receiving_shipment_items` table keeps the same visibility rules
    as the new `receiving_items` table
  - clients should be able to read their own lines so that the dashboard can show
    older receiving products, while admins keep full control
*/

DO $$
BEGIN
  IF to_regclass('public.receiving_shipment_items') IS NULL THEN
    -- nothing to do when the legacy table is missing
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.receiving_shipment_items ENABLE ROW LEVEL SECURITY';

  -- mirror the client visibility rules from receiving_items
  EXECUTE '
    DROP POLICY IF EXISTS "Users can view legacy receiving items"
      ON public.receiving_shipment_items
  ';
  EXECUTE '
    CREATE POLICY "Users can view legacy receiving items"
      ON public.receiving_shipment_items
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM receiving_shipments rs
          WHERE rs.id = receiving_shipment_items.shipment_id
            AND rs.company_id IN (
              SELECT company_id FROM profiles WHERE id = auth.uid()
            )
        )
      )
  ';

  EXECUTE '
    DROP POLICY IF EXISTS "Users can manage legacy receiving items"
      ON public.receiving_shipment_items
  ';
  EXECUTE '
    CREATE POLICY "Users can manage legacy receiving items"
      ON public.receiving_shipment_items
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM receiving_shipments rs
          WHERE rs.id = receiving_shipment_items.shipment_id
            AND rs.company_id IN (
              SELECT company_id FROM profiles WHERE id = auth.uid()
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM receiving_shipments rs
          WHERE rs.id = receiving_shipment_items.shipment_id
            AND rs.company_id IN (
              SELECT company_id FROM profiles WHERE id = auth.uid()
            )
        )
      )
  ';

  EXECUTE '
    DROP POLICY IF EXISTS "Admins can manage legacy receiving items"
      ON public.receiving_shipment_items
  ';
  EXECUTE '
    CREATE POLICY "Admins can manage legacy receiving items"
      ON public.receiving_shipment_items
      FOR ALL
      USING (is_admin())
      WITH CHECK (is_admin())
  ';
END;
$$;
