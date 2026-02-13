-- Fix DB issues: pg_net in public schema + recalculate_all_ranks search_path

-- 1. Move pg_net extension from public to extensions schema (if installed)
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    ALTER EXTENSION pg_net SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not move pg_net to extensions schema: %', SQLERRM;
END $$;

-- 2. Fix recalculate_all_ranks role mutable search_path
ALTER FUNCTION public.recalculate_all_ranks() SET search_path = public, pg_catalog;
