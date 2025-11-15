/*
  # 027: Enhance receiving FBA flow
  - store per-shipment FBA mode (none/full/partial)
  - store per-line send_to_fba + quantity + stock reference
*/

ALTER TABLE IF EXISTS public.receiving_shipments
  ADD COLUMN IF NOT EXISTS fba_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (fba_mode IN ('none', 'full', 'partial'));

ALTER TABLE IF EXISTS public.receiving_items
  ADD COLUMN IF NOT EXISTS send_to_fba BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fba_qty INTEGER NOT NULL DEFAULT 0 CHECK (fba_qty >= 0),
  ADD COLUMN IF NOT EXISTS stock_item_id BIGINT REFERENCES public.stock_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receiving_items_stock_item_id
  ON public.receiving_items(stock_item_id);
