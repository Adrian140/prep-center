-- Add client_store_name to receiving_shipments for admin display
ALTER TABLE receiving_shipments
  ADD COLUMN IF NOT EXISTS client_store_name TEXT;
