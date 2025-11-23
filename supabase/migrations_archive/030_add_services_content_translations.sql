DO $$ 
BEGIN
  -- Services title translations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_title_en'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_title_en TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_title_fr'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_title_fr TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_title_de'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_title_de TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_title_it'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_title_it TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_title_es'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_title_es TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_title_ro'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_title_ro TEXT;
  END IF;

  -- Services subtitle translations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_subtitle_en'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_subtitle_en TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_subtitle_fr'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_subtitle_fr TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_subtitle_de'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_subtitle_de TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_subtitle_it'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_subtitle_it TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_subtitle_es'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_subtitle_es TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'content' AND column_name = 'services_subtitle_ro'
  ) THEN
    ALTER TABLE public.content ADD COLUMN services_subtitle_ro TEXT;
  END IF;

  -- Backfill existing copy into English and Romanian as defaults
  UPDATE public.content
  SET
    services_title_en = COALESCE(services_title_en, services_title),
    services_title_ro = COALESCE(services_title_ro, services_title),
    services_subtitle_en = COALESCE(services_subtitle_en, services_subtitle),
    services_subtitle_ro = COALESCE(services_subtitle_ro, services_subtitle)
  WHERE id = '00000000-0000-0000-0000-000000000001';
END $$;
