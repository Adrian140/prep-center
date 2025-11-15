/*
  # Restore admin access to manage profiles

  The admin dashboard relies on the "Admins can manage all profiles" policy to
  update client-specific fields such as the store name. Migration 036 limited
  this policy to Supabase system roles, which inadvertently removed regular
  authenticated admin users from the allowed role list. As a result, the UI
  shows a success message but the UPDATE is filtered out by RLS and nothing is
  persisted.

  This migration resets the policy back to the default `public` role (covering
  authenticated users) while the dedicated "System roles can manage profiles"
  policy continues to cover Supabase internal roles.
*/

ALTER POLICY "Admins can manage all profiles"
  ON public.profiles
  TO public;
