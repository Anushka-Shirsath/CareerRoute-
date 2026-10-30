-- Private staging only: workbook says redistribution permission is unresolved.
CREATE SCHEMA IF NOT EXISTS cq_private_stage;
REVOKE ALL ON SCHEMA cq_private_stage FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON SCHEMA cq_private_stage FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON SCHEMA cq_private_stage FROM authenticated; END IF;
END $$;
CREATE TABLE IF NOT EXISTS cq_private_stage.fyjc_vacancy_observations (
 row_hash text PRIMARY KEY,
 workbook_sha256 text NOT NULL,
 udise_code text NOT NULL,
 college_name text,
 stream text NOT NULL,
 academic_year text NOT NULL,
 round_name text NOT NULL,
 seat_category text NOT NULL,
 remaining_seats integer,
 note text,
 conflicting_key boolean NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON cq_private_stage.fyjc_vacancy_observations FROM PUBLIC;
