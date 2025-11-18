/*
  # Affiliate Codes & Tracking
  * Adds affiliate_codes table for managing referral codes
  * Extends profiles schema with affiliate fields
  * Updates handle_new_user() to capture affiliate code input
*/

BEGIN;

CREATE TABLE IF NOT EXISTS public.affiliate_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  discount_percent NUMERIC(5,2),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.touch_affiliate_code_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_affiliate_codes_updated ON public.affiliate_codes;
CREATE TRIGGER trg_affiliate_codes_updated
  BEFORE UPDATE ON public.affiliate_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_affiliate_code_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS affiliate_code_input TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_code_id UUID REFERENCES public.affiliate_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS affiliate_notes TEXT;

-- Allow anyone (even anon) to read active codes for validation, admins manage everything
ALTER TABLE public.affiliate_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select affiliate codes" ON public.affiliate_codes;
DROP POLICY IF EXISTS "Admins manage affiliate codes" ON public.affiliate_codes;

CREATE POLICY "Public select affiliate codes"
  ON public.affiliate_codes FOR SELECT
  USING (active = true);

CREATE POLICY "Admins manage affiliate codes"
  ON public.affiliate_codes FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Refresh handle_new_user to capture affiliate metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta JSONB := NEW.raw_user_meta_data;
  account_type TEXT := COALESCE(NULLIF(meta->>'account_type', ''), 'individual');
  company_uuid UUID;
  company_title TEXT;
  fn TEXT := NULLIF(meta->>'first_name', '');
  ln TEXT := NULLIF(meta->>'last_name', '');
  company_name TEXT := NULLIF(meta->>'company_name', '');
  vat_no TEXT := NULLIF(meta->>'vat_number', '');
  cui_val TEXT := NULLIF(meta->>'cui', '');
  billing_country TEXT := COALESCE(NULLIF(meta->>'country', ''), 'FR');
  billing_address TEXT := NULLIF(meta->>'company_address', '');
  billing_city TEXT := NULLIF(meta->>'company_city', '');
  billing_postal TEXT := NULLIF(meta->>'company_postal_code', '');
  billing_phone TEXT := NULLIF(meta->>'phone', '');
  affiliate_input TEXT := NULLIF(meta->>'affiliate_code', '');
BEGIN
  company_uuid := COALESCE(
    NULLIF(meta->>'company_id', '')::UUID,
    NEW.id
  );

  company_title := COALESCE(
    company_name,
    NULLIF(meta->>'store_name', ''),
    NULLIF(TRIM(BOTH ' ' FROM CONCAT_WS(' ', fn, ln)), ''),
    NEW.email
  );

  INSERT INTO public.companies (id, name, created_at, updated_at)
  VALUES (company_uuid, company_title, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        updated_at = NOW();

  INSERT INTO public.profiles (
    id,
    company_id,
    first_name,
    last_name,
    account_type,
    company_name,
    cui,
    vat_number,
    company_address,
    company_city,
    company_postal_code,
    phone,
    country,
    language,
    store_name,
    affiliate_code_input,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    company_uuid,
    fn,
    ln,
    account_type,
    company_name,
    cui_val,
    vat_no,
    meta->>'company_address',
    meta->>'company_city',
    meta->>'company_postal_code',
    billing_phone,
    billing_country,
    meta->>'language',
    meta->>'store_name',
    UPPER(COALESCE(NULLIF(meta->>'affiliate_code_input', ''), affiliate_input)),
    NOW(),
    NOW()
  );

  -- Auto-create company billing profile
  IF account_type = 'company' AND company_name IS NOT NULL THEN
    INSERT INTO public.billing_profiles (
      user_id,
      type,
      company_name,
      vat_number,
      cui,
      country,
      address,
      city,
      postal_code,
      phone,
      is_default,
      first_name,
      last_name
    )
    VALUES (
      NEW.id,
      'company',
      company_name,
      vat_no,
      cui_val,
      billing_country,
      billing_address,
      billing_city,
      billing_postal,
      billing_phone,
      true,
      fn,
      ln
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Auto-create personal billing profile
  IF fn IS NOT NULL OR ln IS NOT NULL THEN
    INSERT INTO public.billing_profiles (
      user_id,
      type,
      first_name,
      last_name,
      country,
      address,
      city,
      postal_code,
      phone,
      is_default
    )
    VALUES (
      NEW.id,
      'individual',
      fn,
      ln,
      billing_country,
      billing_address,
      billing_city,
      billing_postal,
      billing_phone,
      CASE WHEN account_type = 'company' THEN false ELSE true END
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
