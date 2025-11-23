/*
  # Allow Supabase system roles to manage profiles & companies

  Supabase Auth runs the `handle_new_user` trigger as the `supabase_auth_admin`
  role. The trigger inserts into `public.profiles` and `public.companies`, but
  both tables enforce Row Level Security policies that only allow the owning user
  or accounts with `account_type = 'admin'` to write data. Because the system
  roles do not have an `auth.uid()` value (it is NULL), the existing policies
  evaluate to `false`, which makes every signup fail with errors such as:

    - `new row violates row-level security policy for table "profiles"`
    - `permission denied for table admins` (subsequent statements in the same
      transaction cascade and surface as generic auth errors in the UI)

  This migration adds explicit policies that grant the Supabase internal roles
  (`supabase_auth_admin`, `service_role`, `supabase_admin`) unrestricted access
  so that auth triggers can create the necessary rows while keeping the stricter
  user-facing policies untouched.
*/

-- Allow Supabase system roles to perform any action on profiles
DROP POLICY IF EXISTS "System roles can manage profiles" ON public.profiles;

CREATE POLICY "System roles can manage profiles"
  ON public.profiles
  FOR ALL
  TO supabase_auth_admin, service_role, supabase_admin
  USING (true)
  WITH CHECK (true);

-- Allow the same system roles to manage companies (used by the signup trigger)
DROP POLICY IF EXISTS "System roles can manage companies" ON public.companies;

CREATE POLICY "System roles can manage companies"
  ON public.companies
  FOR ALL
  TO supabase_auth_admin, service_role, supabase_admin
  USING (true)
  WITH CHECK (true);
