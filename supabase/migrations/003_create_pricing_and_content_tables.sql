/*
  # Create pricing and content tables
  1. Purpose: Store dynamic pricing and content data for the website.
  2. Schema: 
     - pricing (id, standard_rate, new_customer_rate, starter_price, growth_price, enterprise_price, pallet_storage_price, climate_controlled_price)
     - content (id, hero_title, hero_subtitle, standard_fba_title, standard_fba_subtitle, fnsku_labeling_title, private_label_title, private_label_subtitle, storage_title, storage_subtitle)
  3. Security: RLS enabled with admin-only write access and public read access.
*/

CREATE TABLE IF NOT EXISTS pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_rate TEXT,
  new_customer_rate TEXT,
  starter_price TEXT,
  growth_price TEXT,
  enterprise_price TEXT,
  pallet_storage_price TEXT,
  climate_controlled_price TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_title TEXT,
  hero_subtitle TEXT,
  standard_fba_title TEXT,
  standard_fba_subtitle TEXT,
  fnsku_labeling_title TEXT,
  private_label_title TEXT,
  private_label_subtitle TEXT,
  storage_title TEXT,
  storage_subtitle TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;

-- Policies for pricing table
CREATE POLICY "Anyone can view pricing"
  ON pricing FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage pricing"
  ON pricing FOR ALL
  USING (auth.role() = 'admin');

-- Policies for content table
CREATE POLICY "Anyone can view content"
  ON content FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage content"
  ON content FOR ALL
  USING (auth.role() = 'admin');

-- Insert initial data for pricing (if not exists)
INSERT INTO pricing (id, standard_rate, new_customer_rate, starter_price, growth_price, enterprise_price, pallet_storage_price, climate_controlled_price)
VALUES ('00000000-0000-0000-0000-000000000001', '€0.50', '€0.45', '€1.20', '€1.10', '€0.95', '€15', '+€5')
ON CONFLICT (id) DO NOTHING;

-- Insert initial data for content (if not exists)
INSERT INTO content (id, hero_title, hero_subtitle, standard_fba_title, standard_fba_subtitle, fnsku_labeling_title, private_label_title, private_label_subtitle, storage_title, storage_subtitle)
VALUES ('00000000-0000-0000-0000-000000000001', 'Prep Center France – 24h Turnaround to Amazon FBA', 'Reception, quality control, FNSKU labeling, polybagging & fast shipping to EU Amazon FCs.', 'Standard FBA Services', 'Complete prep solution with everything included', 'FNSKU Labeling Service', 'Private Label & Multi-Platform Services', 'Complete fulfillment solutions for your brand across all platforms', 'Storage Solutions', 'Secure and affordable storage for your inventory')
ON CONFLICT (id) DO NOTHING;

-- Create function to update updated_at timestamp for pricing
CREATE OR REPLACE FUNCTION public.handle_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for pricing updated_at
CREATE OR REPLACE TRIGGER pricing_updated_at
  BEFORE UPDATE ON pricing
  FOR EACH ROW EXECUTE FUNCTION public.handle_pricing_updated_at();

-- Create function to update updated_at timestamp for content
CREATE OR REPLACE FUNCTION public.handle_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for content updated_at
CREATE OR REPLACE TRIGGER content_updated_at
  BEFORE UPDATE ON content
  FOR EACH ROW EXECUTE FUNCTION public.handle_content_updated_at();
