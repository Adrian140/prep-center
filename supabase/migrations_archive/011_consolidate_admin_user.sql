/*
  # Consolidate and Correct Admin User
  1. Purpose: Final cleanup and consolidation of the admin user state to resolve all
     previous inconsistencies. This migration ensures that only the correct user
     is designated as admin.
  2. Correct Admin User ID: 433c644f-05cb-4df3-b6d8-81a88c42ec69
  3. Old/Incorrect Admin User ID: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11
*/

-- Step 1: Clean up any remnants of the old, incorrect admin user.
-- These operations are safe to run even if the user/profile no longer exists.
DELETE FROM public.profiles WHERE id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
DELETE FROM auth.users WHERE id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

-- Step 2: Force-update the correct admin user's metadata in auth.users.
-- This ensures the trigger for profile creation has the correct data.
UPDATE auth.users
SET
  raw_user_meta_data = raw_user_meta_data || '{"account_type": "admin"}'::jsonb,
  email_confirmed_at = NOW() -- Ensure the user is confirmed
WHERE
  id = '433c644f-05cb-4df3-b6d8-81a88c42ec69';

-- Step 3: Force-update the correct admin user's profile in public.profiles.
-- This is the primary check used by the application's security logic (is_admin function).
-- It preserves existing names if they are already set.
INSERT INTO public.profiles (id, first_name, last_name, account_type)
VALUES (
    '433c644f-05cb-4df3-b6d8-81a88c42ec69',
    'Admin',
    'User',
    'admin'
)
ON CONFLICT (id) DO UPDATE SET
    account_type = 'admin',
    first_name = COALESCE(public.profiles.first_name, 'Admin'),
    last_name = COALESCE(public.profiles.last_name, 'User');
