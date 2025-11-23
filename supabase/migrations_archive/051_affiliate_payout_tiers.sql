/*
  # Affiliate payout tiers & invoice policy

  - Adds `payout_tiers` JSONB column on affiliate_codes for flexible thresholds
  - Allows affiliate owners to read paid invoices for their assigned members
*/

BEGIN;

ALTER TABLE public.affiliate_codes
  ADD COLUMN IF NOT EXISTS payout_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;

DROP POLICY IF EXISTS "Affiliate owners can view member invoices" ON public.invoices;

CREATE POLICY "Affiliate owners can view member invoices"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles members
      JOIN public.affiliate_codes ac
        ON ac.id = members.affiliate_code_id
      WHERE members.company_id = public.invoices.company_id
        AND ac.owner_profile_id = auth.uid()
    )
  );

COMMIT;
