/*
  # Create Receiving System Tables
  1. Purpose: Create tables for client receiving notifications and admin receiving management
  2. Schema: 
     - receiving_shipments (id, company_id, user_id, carrier, tracking_id, notes, status, file_path, etc.)
     - receiving_items (id, shipment_id, ean_asin, product_name, quantity_received, sku, purchase_price, etc.)
     - receiving_to_stock_log (id, receiving_item_id, stock_item_id, quantity_moved, etc.)
  3. Security: RLS enabled with company-based access control
*/

-- Create receiving_shipments table
CREATE TABLE IF NOT EXISTS receiving_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  carrier TEXT NOT NULL,
  carrier_other TEXT, -- used when carrier = 'Other'
  tracking_id TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'received', 'processed', 'cancelled')),
  file_path TEXT, -- path to original uploaded file
  created_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create receiving_items table
CREATE TABLE IF NOT EXISTS receiving_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES receiving_shipments(id) ON DELETE CASCADE,
  ean_asin TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_received INTEGER NOT NULL CHECK (quantity_received >= 1),
  sku TEXT,
  purchase_price DECIMAL(10,2),
  quantity_to_stock INTEGER DEFAULT 0 CHECK (quantity_to_stock >= 0),
  remaining_quantity INTEGER GENERATED ALWAYS AS (quantity_received - quantity_to_stock) STORED,
  remaining_action TEXT CHECK (remaining_action IN ('direct_to_amazon', 'hold_for_prep', 'client_pickup', 'damage_loss')),
  line_number INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create receiving_to_stock_log table (audit trail)
CREATE TABLE IF NOT EXISTS receiving_to_stock_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_item_id UUID REFERENCES receiving_items(id) ON DELETE CASCADE,
  stock_item_id BIGINT REFERENCES stock_items(id) ON DELETE CASCADE,
  quantity_moved INTEGER NOT NULL CHECK (quantity_moved > 0),
  moved_at TIMESTAMPTZ DEFAULT NOW(),
  moved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT
);

-- Enable Row Level Security
ALTER TABLE receiving_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receiving_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receiving_to_stock_log ENABLE ROW LEVEL SECURITY;

-- Policies for receiving_shipments
CREATE POLICY "Users can view their company shipments"
  ON receiving_shipments FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their company shipments"
  ON receiving_shipments FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all shipments"
  ON receiving_shipments FOR ALL
  USING (is_admin());

-- Policies for receiving_items
CREATE POLICY "Users can view their company items"
  ON receiving_items FOR SELECT
  USING (
    shipment_id IN (
      SELECT id FROM receiving_shipments
      WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage their company items"
  ON receiving_items FOR ALL
  USING (
    shipment_id IN (
      SELECT id FROM receiving_shipments
      WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can manage all items"
  ON receiving_items FOR ALL
  USING (is_admin());

-- Policies for receiving_to_stock_log
CREATE POLICY "Users can view their company stock log"
  ON receiving_to_stock_log FOR SELECT
  USING (
    receiving_item_id IN (
      SELECT ri.id FROM receiving_items ri
      JOIN receiving_shipments rs ON ri.shipment_id = rs.id
      WHERE rs.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can manage all stock log"
  ON receiving_to_stock_log FOR ALL
  USING (is_admin());

-- Create triggers for timestamp updates
CREATE OR REPLACE FUNCTION handle_receiving_shipment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Set submitted_at when status changes to submitted
  IF NEW.status = 'submitted' AND OLD.status != 'submitted' THEN
    NEW.submitted_at = NOW();
  END IF;
  
  -- Set received_at when status changes to received
  IF NEW.status = 'received' AND OLD.status != 'received' THEN
    NEW.received_at = NOW();
  END IF;
  
  -- Set processed_at when status changes to processed
  IF NEW.status = 'processed' AND OLD.status != 'processed' THEN
    NEW.processed_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER receiving_shipment_status_timestamps
  BEFORE UPDATE ON receiving_shipments
  FOR EACH ROW EXECUTE FUNCTION handle_receiving_shipment_updated_at();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_receiving_shipments_company_id ON receiving_shipments(company_id);
CREATE INDEX IF NOT EXISTS idx_receiving_shipments_status ON receiving_shipments(status);
CREATE INDEX IF NOT EXISTS idx_receiving_shipments_created_at ON receiving_shipments(created_at);
CREATE INDEX IF NOT EXISTS idx_receiving_items_shipment_id ON receiving_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_receiving_items_ean_asin ON receiving_items(ean_asin);
CREATE INDEX IF NOT EXISTS idx_receiving_to_stock_log_receiving_item_id ON receiving_to_stock_log(receiving_item_id);

-- Insert sample carriers for dropdown
CREATE TABLE IF NOT EXISTS carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

-- Enable RLS for carriers
ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read carriers
CREATE POLICY "Anyone can view carriers"
  ON carriers FOR SELECT
  USING (active = true);

-- Only admins can manage carriers
CREATE POLICY "Admins can manage carriers"
  ON carriers FOR ALL
  USING (is_admin());

-- Insert default carriers
INSERT INTO carriers (name, code, sort_order) VALUES
  ('UPS', 'UPS', 1),
  ('DHL', 'DHL', 2),
  ('DPD', 'DPD', 3),
  ('GLS', 'GLS', 4),
  ('Chronopost', 'CHRONOPOST', 5),
  ('Colissimo', 'COLISSIMO', 6),
  ('FedEx', 'FEDEX', 7),
  ('Other', 'OTHER', 999)
ON CONFLICT (code) DO NOTHING;
