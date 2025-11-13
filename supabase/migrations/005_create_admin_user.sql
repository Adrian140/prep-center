/*
  # Create Admin User
  1. Purpose: Create a default admin user for site management.
  2. User: contact@prep-center.eu
  3. Password: password123
  4. Security: This migration creates a user with a simple password for development. 
     In a production environment, use a strong, securely generated password.
*/

-- Ensure pgcrypto functions are available for crypt()/gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Insert the admin user into auth.users, and update if it already exists to ensure password and email are correct.
INSERT INTO auth.users (id, email, encrypted_password, role, aud, email_confirmed_at, raw_user_meta_data)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', -- Pre-defined UUID for the admin user
    'contact@prep-center.eu',
    crypt('password123', gen_salt('bf')), -- IMPORTANT: Use a secure password in production
    'authenticated',
    'authenticated',
    NOW(),
    '{"provider":"email","providers":["email"],"first_name":"Admin","last_name":"User","account_type":"admin"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  email = 'contact@prep-center.eu',
  encrypted_password = crypt('password123', gen_salt('bf')),
  email_confirmed_at = NOW(),
  raw_user_meta_data = '{"provider":"email","providers":["email"],"first_name":"Admin","last_name":"User","account_type":"admin"}'::jsonb;

-- Insert the corresponding profile. The `on_auth_user_created` trigger might handle this,
-- but we insert it explicitly to guarantee the profile exists and the account_type is 'admin'.
INSERT INTO public.profiles (id, first_name, last_name, account_type)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Admin',
    'User',
    'admin'
)
ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    account_type = EXCLUDED.account_type;
