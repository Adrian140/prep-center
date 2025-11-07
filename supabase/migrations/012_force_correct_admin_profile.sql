/*
  # Force Correct Admin Profile
  1. Purpose: Ensure the user 'contact@prep-center.eu' has the 'admin' account_type.
  2. Reason: Resolves login redirection issues where the user is not recognized as an admin.
     This migration is definitive and corrects any previous inconsistencies.
*/

-- Step 1: Ensure the profile exists for the admin user.
-- This will insert a new profile or do nothing if one already exists.
INSERT INTO public.profiles (id, first_name, last_name, account_type)
SELECT
    id,
    'Admin',
    'User',
    'individual' -- Set to a non-admin default to ensure the UPDATE below always runs
FROM auth.users
WHERE email = 'contact@prep-center.eu'
ON CONFLICT (id) DO NOTHING;

-- Step 2: Force-update the account_type to 'admin' for the correct user.
-- This is the critical step that fixes the redirection logic.
UPDATE public.profiles
SET account_type = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'contact@prep-center.eu');
