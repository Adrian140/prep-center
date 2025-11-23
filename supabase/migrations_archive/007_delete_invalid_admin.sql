/*
  # Delete Invalid Admin User
  1. Purpose: Remove the admin user created with an incompatible password hash.
  2. User: contact@prep-center.eu
  3. Reason: The previous method of creating the user via SQL resulted in an
     unusable password. This migration cleans the state to allow for proper
     user creation through the application's registration form.
*/

DELETE FROM auth.users WHERE email = 'contact@prep-center.eu';
