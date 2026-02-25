-- Fix Supabase linter warning: function_search_path_mutable
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

alter function if exists public.touch_profit_path_integrations_updated_at()
  set search_path = public;

alter function if exists public.tg_set_prep_request_completed_at()
  set search_path = public;

alter function if exists public.touch_client_integration_visibility_updated_at()
  set search_path = public;
