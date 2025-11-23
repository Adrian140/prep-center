DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_current_timestamp_updated_at'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.set_current_timestamp_updated_at()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;
    $fn$;
  END IF;
END $$;
