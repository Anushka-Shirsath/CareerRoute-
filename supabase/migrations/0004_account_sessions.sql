-- Separate account sessions from expiring guest workspaces. Only the server's
-- restricted system role may resolve opaque session tokens.
CREATE TABLE IF NOT EXISTS public.account_sessions (
  token_hash varchar(64) PRIMARY KEY,
  user_id varchar(36) NOT NULL,
  expires_at varchar(40) NOT NULL,
  created_at varchar(40) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_account_sessions_user_id ON public.account_sessions (user_id);
CREATE INDEX IF NOT EXISTS ix_account_sessions_expires_at ON public.account_sessions (expires_at);
ALTER TABLE public.account_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_session_system ON public.account_sessions;
CREATE POLICY account_session_system ON public.account_sessions TO cq_system USING (true) WITH CHECK (true);
REVOKE ALL ON public.account_sessions FROM PUBLIC;
DO $$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON public.account_sessions FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_sessions TO cq_system;
