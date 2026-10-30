-- CareerQuest uses its own restricted PostgreSQL login through FastAPI.
-- Supabase's generated Data API must not grant browser roles table privileges.
DO $$
DECLARE app_table text; browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = browser_role) THEN
      FOREACH app_table IN ARRAY ARRAY[
        'admission_cycles', 'domain_events', 'guest_sessions', 'import_runs',
        'institutions', 'publication_history', 'rate_counters', 'report_shares',
        'sources', 'student_sensitive_attributes', 'verification_queue',
        'workspace_records', 'offerings', 'cutoffs', 'fees'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', app_table, browser_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;
