/*
  # Allow system roles to insert/update companies via handle_new_user
  RLS alone wasn't enough – Supabase's internal roles (supabase_auth_admin, service_role, supabase_admin)
  also need explicit table privileges to avoid "permission denied for table companies" when the auth trigger
  upserts companies during signup.
*/

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies
  TO supabase_admin, supabase_auth_admin, service_role;

GRANT USAGE, SELECT ON SEQUENCE public.company_code_seq
  TO supabase_admin, supabase_auth_admin, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles
  TO supabase_admin, supabase_auth_admin, service_role;

ALTER POLICY "Admins can manage all profiles"
  ON public.profiles
  TO supabase_admin, supabase_auth_admin, service_role;
