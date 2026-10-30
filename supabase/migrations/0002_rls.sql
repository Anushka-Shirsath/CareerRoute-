-- Anonymous browser identity is resolved by the server, then set transaction-locally.
-- None of these roles is a superuser or has BYPASSRLS. The API login must NOINHERIT.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cq_public') THEN CREATE ROLE cq_public NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cq_student') THEN CREATE ROLE cq_student NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cq_system') THEN CREATE ROLE cq_system NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO cq_public, cq_student, cq_system;

ALTER TABLE workspace_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_records FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_owner ON workspace_records TO cq_student
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
-- Includes result revisions, subjects, game events, memories, checklists and reports.
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_records TO cq_student;

ALTER TABLE student_sensitive_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_sensitive_attributes FORCE ROW LEVEL SECURITY;
CREATE POLICY sensitive_owner ON student_sensitive_attributes TO cq_student
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON student_sensitive_attributes TO cq_student;

ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;
CREATE POLICY events_owner ON domain_events TO cq_student
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON domain_events TO cq_student;

ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY session_system ON guest_sessions TO cq_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON guest_sessions TO cq_system;

ALTER TABLE rate_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY rate_owner ON rate_counters TO cq_student
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
CREATE POLICY rate_system ON rate_counters TO cq_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_counters TO cq_student, cq_system;

ALTER TABLE report_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY share_owner ON report_shares TO cq_student
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
-- Public-token reads have no workspace access. The endpoint must additionally
-- filter token_hash, expires_at and revoked in a single SELECT.
CREATE POLICY share_system ON report_shares TO cq_system USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON report_shares TO cq_student;
GRANT SELECT ON report_shares TO cq_system;

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions FORCE ROW LEVEL SECURITY;
CREATE POLICY institution_published ON institutions FOR SELECT TO cq_public, cq_student
  USING (publish_state = 'published');
ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerings FORCE ROW LEVEL SECURITY;
CREATE POLICY offering_published ON offerings FOR SELECT TO cq_public, cq_student
  USING (publish_state = 'published' AND EXISTS (
    SELECT 1 FROM institutions i WHERE i.id = institution_id AND i.publish_state = 'published'));
ALTER TABLE cutoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cutoffs FORCE ROW LEVEL SECURITY;
CREATE POLICY cutoff_published ON cutoffs FOR SELECT TO cq_public, cq_student
  USING (EXISTS (SELECT 1 FROM offerings o WHERE o.id = offering_id AND o.publish_state = 'published'));
ALTER TABLE fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE fees FORCE ROW LEVEL SECURITY;
CREATE POLICY fee_published ON fees FOR SELECT TO cq_public, cq_student
  USING (EXISTS (SELECT 1 FROM offerings o WHERE o.id = offering_id AND o.publish_state = 'published'));
GRANT SELECT ON institutions, offerings, cutoffs, fees TO cq_public, cq_student;

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources FORCE ROW LEVEL SECURITY;
CREATE POLICY source_public ON sources FOR SELECT TO cq_public, cq_student USING (true);
ALTER TABLE admission_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_cycles FORCE ROW LEVEL SECURITY;
CREATE POLICY cycle_public ON admission_cycles FOR SELECT TO cq_public, cq_student USING (true);
ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY coverage_public ON import_runs FOR SELECT TO cq_public, cq_student USING (status = 'published');
GRANT SELECT ON sources, admission_cycles, import_runs TO cq_public, cq_student;

ALTER TABLE verification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE publication_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_history FORCE ROW LEVEL SECURITY;
-- Neither the public nor student nor system roles may approve or publish imports.

REVOKE ALL ON workspace_records, student_sensitive_attributes, guest_sessions,
  report_shares, rate_counters, domain_events, verification_queue, publication_history
  FROM PUBLIC;
