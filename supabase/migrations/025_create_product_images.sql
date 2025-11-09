/*
  # Create product_images table for photo management
*/

CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id BIGINT NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_images_stock_idx ON public.product_images(stock_item_id);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their product images" ON public.product_images
  FOR SELECT USING (
    stock_item_id IN (
      SELECT si.id FROM public.stock_items si
      WHERE (si.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
         OR (si.user_id = auth.uid())
    ) OR is_admin()
  );

CREATE POLICY "Users can manage their product images" ON public.product_images
  FOR ALL USING (
    stock_item_id IN (
      SELECT si.id FROM public.stock_items si
      WHERE (si.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
         OR (si.user_id = auth.uid())
    ) OR is_admin()
  ) WITH CHECK (
    stock_item_id IN (
      SELECT si.id FROM public.stock_items si
      WHERE (si.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
         OR (si.user_id = auth.uid())
    ) OR is_admin()
  );
