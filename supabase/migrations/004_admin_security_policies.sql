/*
  # Admin Security Policies
  1. Purpose: Create a helper function to check for admin role and update table policies for enhanced security.
  2. Function: is_admin()
  3. Policies: services, pricing, content, profiles
*/

-- Create a function to check if the current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_account_type TEXT;
BEGIN
  SELECT account_type INTO user_account_type
  FROM public.profiles
  WHERE id = auth.uid();
  
  RETURN user_account_type = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update policies for services table
-- Drop existing permissive policies first
DROP POLICY IF EXISTS "Authenticated users can manage services" ON services;
DROP POLICY IF EXISTS "Anyone can view services" ON services;

-- Create new, more secure policies for services
CREATE POLICY "Anyone can view services"
  ON services FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage services"
  ON services FOR ALL
  USING (is_admin());

-- Update policies for pricing table
-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage pricing" ON pricing;

-- Create new policy using the function
CREATE POLICY "Admins can manage pricing"
  ON pricing FOR ALL
  USING (is_admin());

-- Update policies for content table
-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage content" ON content;

-- Create new policy using the function
CREATE POLICY "Admins can manage content"
  ON content FOR ALL
  USING (is_admin());

-- Add admin policies for profiles table
CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());