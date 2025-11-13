/*
  # Allow internal roles to create companies on signup
  handle_new_user now upserts a row in public.companies before inserting the profile. In production
  that insert runs under Supabase's internal roles (auth/service) which do not satisfy the existing
  "Admins can manage all companies" RLS policy, so the signup fails with
  "Database error saving new user". This migration grants those internal roles explicit permission
  while keeping end-user access restrictions unchanged.
*/

DROP POLICY IF EXISTS "System roles manage companies" ON public.companies;

CREATE POLICY "System roles manage companies"
  ON public.companies
  FOR ALL
  TO supabase_admin, supabase_auth_admin, service_role
  USING (true)
  WITH CHECK (true);
