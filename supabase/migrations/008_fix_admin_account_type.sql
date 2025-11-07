/*
  # Fix Admin Account Type
  1. Purpose: Ensure the admin user has the correct 'admin' account_type in the profiles table.
  2. User ID: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11 (contact@prep-center.eu)
  3. Reason: The user is being redirected to the user dashboard instead of the admin panel,
     indicating that the profile.account_type is not 'admin'. This migration
     forcefully corrects the value to ensure proper admin access and routing.
*/

UPDATE public.profiles
SET account_type = 'admin'
WHERE id = '433c644f-05cb-4df3-b6d8-81a88c42ec69';
