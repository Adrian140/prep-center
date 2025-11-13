/*
  # Auto-populate billing profiles on signup

  Extends `handle_new_user` so that whenever a profile is created from a signup,
  we automatically create billing records that mirror the submitted company data
  and contact person. This keeps the Billing Details section pre-filled for new
  clients without requiring manual admin work.
*/

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
