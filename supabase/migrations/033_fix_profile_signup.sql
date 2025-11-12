/*
  # Ensure profiles get a company_id on signup
  1. Adds missing columns (company_id, store_name) if they don't exist locally.
  2. Recreates handle_new_user trigger function so every signup stores company_id (defaults to user id).
  3. Backfills existing rows where company_id is still null.
*/

-- Ensure new columns exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id UUID,
  ADD COLUMN IF NOT EXISTS store_name TEXT;

-- Backfill company_id for legacy rows
UPDATE public.profiles
SET company_id = id
WHERE company_id IS NULL;

-- Updated trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta JSONB := NEW.raw_user_meta_data;
  company_uuid UUID;
BEGIN
  company_uuid := COALESCE(
    NULLIF(meta->>'company_id', '')::UUID,
    NEW.id
  );

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
    meta->>'first_name',
    meta->>'last_name',
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
