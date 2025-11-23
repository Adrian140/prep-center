/*
  # Create Export System Tables
  1. Purpose: Create tables for monthly stock exports system
  2. Schema: 
     - companies (id, name, created_at) - simple company registry
     - export_files (id, company_id, export_type, period_start, period_end, file_path, rows_count, totals_json, status, created_at)
  3. Security: RLS enabled with company-based access control
*/

-- Create companies table (simplified - each user is their own company)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create export_files table
CREATE TABLE IF NOT EXISTS export_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL, -- 'stock_monthly_snapshot'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  file_path TEXT,
  rows_count INTEGER DEFAULT 0,
  totals_json JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_files ENABLE ROW LEVEL SECURITY;

-- Policies for companies
CREATE POLICY "Users can view their company"
  ON companies FOR SELECT
  USING (
    id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all companies"
  ON companies FOR ALL
  USING (is_admin());

-- Policies for export_files  
CREATE POLICY "Users can view their exports"
  ON export_files FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all exports"
  ON export_files FOR ALL
  USING (is_admin());

-- Create function to update updated_at timestamp for companies
CREATE OR REPLACE FUNCTION public.handle_companies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for companies updated_at
CREATE OR REPLACE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_companies_updated_at();

-- Create function to update updated_at timestamp for export_files
CREATE OR REPLACE FUNCTION public.handle_export_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for export_files updated_at
CREATE OR REPLACE TRIGGER export_files_updated_at
  BEFORE UPDATE ON export_files
  FOR EACH ROW EXECUTE FUNCTION public.handle_export_files_updated_at();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_companies_created_at ON companies(created_at);
CREATE INDEX IF NOT EXISTS idx_export_files_company_id ON export_files(company_id);
CREATE INDEX IF NOT EXISTS idx_export_files_type_period ON export_files(export_type, period_end);
CREATE INDEX IF NOT EXISTS idx_export_files_status ON export_files(status);

-- Populate companies table based on existing profiles with company_id
-- This ensures every profile that has stock has a corresponding company entry
DO $$
DECLARE
    profile_row RECORD;
BEGIN
    FOR profile_row IN 
        SELECT DISTINCT company_id, company_name, first_name, last_name 
        FROM profiles 
        WHERE company_id IS NOT NULL
    LOOP
        INSERT INTO companies (id, name)
        VALUES (
            profile_row.company_id,
            COALESCE(
                profile_row.company_name, 
                profile_row.first_name || ' ' || profile_row.last_name,
                'Customer Company'
            )
        )
        ON CONFLICT (id) DO NOTHING;
    END LOOP;
END $$;

-- Ensure every profile has a company_id (create missing ones)
UPDATE profiles 
SET company_id = id 
WHERE company_id IS NULL;

-- Create company entries for profiles that didn't have company_id before
INSERT INTO companies (id, name)
SELECT 
    p.id,
    COALESCE(
        p.company_name,
        p.first_name || ' ' || p.last_name,
        'Customer Company'
    )
FROM profiles p
LEFT JOIN companies c ON p.company_id = c.id
WHERE c.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Update profiles to use their own ID as company_id if they don't have one
UPDATE profiles 
SET company_id = id 
WHERE company_id IS NULL;
