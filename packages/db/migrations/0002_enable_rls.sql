-- Supabase exposes the public schema through its REST API to the anon and authenticated
-- roles. Velum never uses that API: the app connects as the table owner, which bypasses
-- RLS. Enabling RLS with no policies denies every row to those API roles.
-- Reversible: ALTER TABLE ... DISABLE ROW LEVEL SECURITY for each table.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
