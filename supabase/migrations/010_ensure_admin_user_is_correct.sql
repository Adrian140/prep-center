/*
  # Ensure Admin User is Correctly Marked
  1. Purpose: Force-update the admin user's metadata and profile to ensure the 'admin'
     account type is set correctly in all relevant locations.
  2. User ID: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11 (contact@prep-center.eu)
  3. Reason: To resolve any lingering inconsistencies from previous migrations and
     guarantee the user is recognized as an admin by the application.
*/

-- Step 1: Ensure raw_user_meta_data in auth.users contains the admin flag.
-- This is important for the trigger that creates the profile for new users.
UPDATE auth.users
SET
  raw_user_meta_data = raw_user_meta_data || '{"account_type": "admin"}'::jsonb
WHERE
  id = '433c644f-05cb-4df3-b6d8-81a88c42ec69';

-- Step 2: Ensure the profile in public.profiles is correctly set to admin.
-- This is the primary check used by the application logic (AdminRoute, is_admin function).
INSERT INTO public.profiles (id, first_name, last_name, account_type)
VALUES (
    '433c644f-05cb-4df3-b6d8-81a88c42ec69',
    'Admin',
    'User',
    'admin'
)
ON CONFLICT (id) DO UPDATE SET
    account_type = 'admin',
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name;
