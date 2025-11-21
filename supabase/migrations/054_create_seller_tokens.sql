/*
  # Seller tokens

  Stores Amazon SP-API refresh tokens per seller.
*/

BEGIN;

CREATE TABLE IF NOT EXISTS public.seller_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  marketplace_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.touch_seller_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seller_tokens_updated ON public.seller_tokens;
CREATE TRIGGER trg_seller_tokens_updated
  BEFORE UPDATE ON public.seller_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_seller_tokens_updated_at();

ALTER TABLE public.seller_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages seller tokens"
  ON public.seller_tokens
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_tokens
  TO service_role, supabase_admin, supabase_auth_admin;

COMMIT;
