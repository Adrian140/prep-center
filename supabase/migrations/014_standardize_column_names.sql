/*
  # Standardize Column Names to snake_case
  1. Purpose: Rename all camelCase columns to snake_case for consistency and to fix Supabase client mapping issues.
  2. Tables: pricing, content
  3. Reason: PostgreSQL lowercases unquoted identifiers, leading to a mismatch between the client's expected camelCase and the database's actual lowercase column names. This migration corrects the names to the standard snake_case format. This migration is designed to run safely even if columns have been renamed previously.
*/

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='standardrate') THEN
    ALTER TABLE public.pricing RENAME COLUMN standardrate TO standard_rate;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='newcustomerrate') THEN
    ALTER TABLE public.pricing RENAME COLUMN newcustomerrate TO new_customer_rate;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='starterprice') THEN
    ALTER TABLE public.pricing RENAME COLUMN starterprice TO starter_price;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='growthprice') THEN
    ALTER TABLE public.pricing RENAME COLUMN growthprice TO growth_price;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='enterpriseprice') THEN
    ALTER TABLE public.pricing RENAME COLUMN enterpriseprice TO enterprise_price;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='palletstorageprice') THEN
    ALTER TABLE public.pricing RENAME COLUMN palletstorageprice TO pallet_storage_price;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='pricing' AND column_name='climatecontrolledprice') THEN
    ALTER TABLE public.pricing RENAME COLUMN climatecontrolledprice TO climate_controlled_price;
  END IF;

  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='herotitle') THEN
    ALTER TABLE public.content RENAME COLUMN herotitle TO hero_title;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='herosubtitle') THEN
    ALTER TABLE public.content RENAME COLUMN herosubtitle TO hero_subtitle;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='standardfbatitle') THEN
    ALTER TABLE public.content RENAME COLUMN standardfbatitle TO standard_fba_title;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='standardfbasubtitle') THEN
    ALTER TABLE public.content RENAME COLUMN standardfbasubtitle TO standard_fba_subtitle;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fnskulabelingtitle') THEN
    ALTER TABLE public.content RENAME COLUMN fnskulabelingtitle TO fnsku_labeling_title;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='privatelabeltitle') THEN
    ALTER TABLE public.content RENAME COLUMN privatelabeltitle TO private_label_title;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='privatelabelsubtitle') THEN
    ALTER TABLE public.content RENAME COLUMN privatelabelsubtitle TO private_label_subtitle;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storagetitle') THEN
    ALTER TABLE public.content RENAME COLUMN storagetitle TO storage_title;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storagesubtitle') THEN
    ALTER TABLE public.content RENAME COLUMN storagesubtitle TO storage_subtitle;
  END IF;
END $$;
