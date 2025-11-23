/*
  # Ensure company row exists for new profiles
  The previous trigger populated company_id but didn't insert a matching row in public.companies,
  which violates the foreign key. This version:
    * derives a readable company name from metadata (company/store/personal name/email fallback)
    * upserts a row into public.companies before inserting the profile
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta JSONB := NEW.raw_user_meta_data;
  company_uuid UUID;
  company_title TEXT;
  fn TEXT := NULLIF(meta->>'first_name', '');
  ln TEXT := NULLIF(meta->>'last_name', '');
BEGIN
  company_uuid := COALESCE(
    NULLIF(meta->>'company_id', '')::UUID,
    NEW.id
  );

  company_title := COALESCE(
    NULLIF(meta->>'company_name', ''),
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
    COALESCE(meta->>'account_type', 'individual'),
    meta->>'company_name',
    meta->>'cui',
    meta->>'vat_number',
    meta->>'company_address',
    meta->>'company_city',
    meta->>'company_postal_code',
    meta->>'phone',
    meta->>'country',
    meta->>'language',
    meta->>'store_name',
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
