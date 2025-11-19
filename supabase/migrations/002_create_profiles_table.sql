/*
  # Create profiles table
  1. Purpose: Store user profile data, extending the auth.users table.
  2. Schema: profiles (id, first_name, last_name, account_type, etc.)
  3. Security: RLS enabled. Users can manage their own profile.
  4. Trigger: Automatically create a profile on new user signup.
*/

-- Create the profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  first_name TEXT,
  last_name TEXT,
  account_type TEXT NOT NULL DEFAULT 'individual',
  company_name TEXT,
  cui TEXT,
  vat_number TEXT,
  company_address TEXT,
  company_city TEXT,
  company_postal_code TEXT,
  phone TEXT,
  country TEXT,
  language TEXT
);

-- Add comments to the columns
COMMENT ON COLUMN public.profiles.id IS 'User ID from auth.users';
COMMENT ON COLUMN public.profiles.account_type IS 'Type of account: individual, company, or admin';

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles table
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Affiliate owners can view affiliate members"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.affiliate_codes ac
      WHERE ac.owner_profile_id = auth.uid()
        AND ac.id = public.profiles.affiliate_code_id
    )
  );

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- This function will be called by a trigger when a new user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, account_type, company_name, cui, vat_number, company_address, company_city, company_postal_code, phone, country, language)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'account_type',
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'cui',
    NEW.raw_user_meta_data->>'vat_number',
    NEW.raw_user_meta_data->>'company_address',
    NEW.raw_user_meta_data->>'company_city',
    NEW.raw_user_meta_data->>'company_postal_code',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'language'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to call the function when a new user is created
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for profiles updated_at
CREATE OR REPLACE TRIGGER profile_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_updated_at();
