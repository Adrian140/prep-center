DO $$
BEGIN
  ALTER TABLE public.pricing_services
    ALTER COLUMN price TYPE text USING price::text;

  ALTER TABLE public.pricing_services
    ALTER COLUMN unit TYPE text USING unit::text;
END $$;
