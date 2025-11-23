    /*
      # Add New Pricing Columns
      1. Purpose: Add new columns to the 'pricing' table to support detailed calculator functionalities.
      2. Schema: pricing (add pl_fnsku_labeling, pl_polybagging, pl_multipack, fbm_amazon, fbm_ebay, fbm_shopify, labels_client, labels_translation)
      3. Security: Policies are already in place.
    */

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='pl_fnsku_labeling') THEN
        ALTER TABLE public.pricing ADD COLUMN pl_fnsku_labeling TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='pl_polybagging') THEN
        ALTER TABLE public.pricing ADD COLUMN pl_polybagging TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='pl_multipack') THEN
        ALTER TABLE public.pricing ADD COLUMN pl_multipack TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='fbm_amazon') THEN
        ALTER TABLE public.pricing ADD COLUMN fbm_amazon TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='fbm_ebay') THEN
        ALTER TABLE public.pricing ADD COLUMN fbm_ebay TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='fbm_shopify') THEN
        ALTER TABLE public.pricing ADD COLUMN fbm_shopify TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='labels_client') THEN
        ALTER TABLE public.pricing ADD COLUMN labels_client TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='labels_translation') THEN
        ALTER TABLE public.pricing ADD COLUMN labels_translation TEXT;
      END IF;
    END $$;

    -- Update the existing row with default values for the new columns
    UPDATE public.pricing
    SET
      pl_fnsku_labeling = '0.35',
      pl_polybagging = '0.15',
      pl_multipack = '0.50',
      fbm_amazon = '1.30',
      fbm_ebay = '1.30',
      fbm_shopify = '1.30',
      labels_client = '0.20',
      labels_translation = '5.00'
    WHERE id = '00000000-0000-0000-0000-000000000001';
  