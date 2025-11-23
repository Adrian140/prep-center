/*
  # Refresh Schema Cache
  1. Purpose: Force PostgREST to reload the database schema cache.
  2. Reason: To resolve "Could not find column/table in schema cache" errors that
     can occur after running migrations. This ensures the API layer is
     in sync with the latest database structure.
*/

NOTIFY pgrst, 'reload schema';
