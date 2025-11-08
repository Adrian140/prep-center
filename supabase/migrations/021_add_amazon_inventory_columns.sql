/*
  # Add amazon inventory breakdown columns to stock_items

  Stores inbound/unfulfillable/reserved counts coming from Amazon SP-API.
*/

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS amazon_inbound INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amazon_unfulfillable INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amazon_reserved INTEGER NOT NULL DEFAULT 0;
