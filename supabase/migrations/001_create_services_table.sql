/*
  # Create services table
  1. Purpose: Store the services offered by the prep center.
  2. Schema: services (id, title, description, features, price, unit, category, active)
  3. Security: RLS will be enabled. Policies are managed in a later migration.
*/

-- Create the services table
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  features TEXT[],
  price TEXT,
  unit TEXT,
  category TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Create function to update updated_at timestamp for services
CREATE OR REPLACE FUNCTION public.handle_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for services updated_at
CREATE OR REPLACE TRIGGER services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.handle_services_updated_at();
