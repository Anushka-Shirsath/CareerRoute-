CREATE SCHEMA IF NOT EXISTS cq_private_stage;
REVOKE ALL ON SCHEMA cq_private_stage FROM PUBLIC;
CREATE TABLE IF NOT EXISTS cq_private_stage.fyjc_cutoff_observations (
 row_hash text PRIMARY KEY, workbook_sha256 text NOT NULL, udise_code text,
 choice_code text NOT NULL, academic_year text NOT NULL, round_name text NOT NULL,
 seat_category text NOT NULL, reservation text, cutoff_value_raw text NOT NULL,
 metric_status text NOT NULL DEFAULT 'scale_unverified', imported_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON cq_private_stage.fyjc_cutoff_observations FROM PUBLIC;
