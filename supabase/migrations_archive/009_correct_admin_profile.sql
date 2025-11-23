/*
  # Correct Admin Profile
  1. Purpose: Ensure the admin user's profile exists and has the correct 'admin' account_type.
  2. User ID: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11 (contact@prep-center.eu)
  3. Reason: The previous migration (008) used an incorrect user ID. This migration
     corrects the profile for the actual admin user, ensuring proper redirection
     to the admin panel upon login.
*/

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
