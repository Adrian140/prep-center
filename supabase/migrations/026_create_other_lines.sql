/*
  # Create other_lines table for miscellaneous billing entries
*/

CREATE TABLE IF NOT EXISTS public.other_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  units NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2),
  obs_admin TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS other_lines_company_idx ON public.other_lines(company_id, service_date DESC);

CREATE OR REPLACE FUNCTION public.set_other_lines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_other_lines_updated_at ON public.other_lines;
CREATE TRIGGER trg_other_lines_updated_at
  BEFORE UPDATE ON public.other_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_other_lines_updated_at();

ALTER TABLE public.other_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view other_lines" ON public.other_lines;
CREATE POLICY "Company members can view other_lines"
  ON public.other_lines
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id
      FROM public.profiles
      WHERE id = auth.uid()
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Company members can manage other_lines" ON public.other_lines;
CREATE POLICY "Company members can manage other_lines"
  ON public.other_lines
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Clients can insert photo subscription" ON public.other_lines;
CREATE POLICY "Clients can insert photo subscription"
  ON public.other_lines
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.profiles
      WHERE id = auth.uid()
    )
    AND service = 'Photo storage subscription'
  );

DROP POLICY IF EXISTS "Clients can delete photo subscription" ON public.other_lines;
CREATE POLICY "Clients can delete photo subscription"
  ON public.other_lines
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id
      FROM public.profiles
      WHERE id = auth.uid()
    )
    AND service = 'Photo storage subscription'
  );
