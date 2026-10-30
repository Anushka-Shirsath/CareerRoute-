-- Generated from app/models.py. Apply to an empty database as its administrator.



CREATE TABLE admission_cycles (
	id VARCHAR(100) NOT NULL, 
	data JSON NOT NULL, 
	PRIMARY KEY (id)
)

;


CREATE TABLE domain_events (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	event_type VARCHAR(40) NOT NULL, 
	entity_id VARCHAR(100) NOT NULL, 
	revision INTEGER NOT NULL, 
	created_at VARCHAR(40) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (user_id, event_type, entity_id, revision)
)

;

CREATE INDEX ix_domain_events_user_id ON domain_events (user_id);


CREATE TABLE guest_sessions (
	token_hash VARCHAR(64) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	expires_at VARCHAR(40) NOT NULL, 
	created_at VARCHAR(40) NOT NULL, 
	PRIMARY KEY (token_hash), 
	UNIQUE (user_id)
)

;


CREATE TABLE import_runs (
	id VARCHAR(100) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	data JSON NOT NULL, 
	PRIMARY KEY (id)
)

;


CREATE TABLE institutions (
	id VARCHAR(100) NOT NULL, 
	name TEXT NOT NULL, 
	district VARCHAR(100), 
	management VARCHAR(40) NOT NULL, 
	pathway VARCHAR(40) NOT NULL, 
	publish_state VARCHAR(20) NOT NULL, 
	data JSON NOT NULL, 
	PRIMARY KEY (id)
)

;

CREATE INDEX ix_institutions_district ON institutions (district);

CREATE INDEX ix_institutions_management ON institutions (management);

CREATE INDEX ix_institutions_pathway ON institutions (pathway);

CREATE INDEX ix_institutions_publish_state ON institutions (publish_state);


CREATE TABLE publication_history (
	id VARCHAR(36) NOT NULL, 
	run_id VARCHAR(100) NOT NULL, 
	created_at VARCHAR(40) NOT NULL, 
	data JSON NOT NULL, 
	PRIMARY KEY (id)
)

;

CREATE INDEX ix_publication_history_run_id ON publication_history (run_id);


CREATE TABLE rate_counters (
	user_id VARCHAR(64) NOT NULL, 
	bucket VARCHAR(80) NOT NULL, 
	count INTEGER NOT NULL, 
	PRIMARY KEY (user_id, bucket)
)

;


CREATE TABLE report_shares (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	report_id VARCHAR(100) NOT NULL, 
	token_hash VARCHAR(64) NOT NULL, 
	expires_at VARCHAR(40) NOT NULL, 
	revoked BOOLEAN NOT NULL, 
	snapshot JSON NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (report_id), 
	UNIQUE (token_hash)
)

;

CREATE INDEX ix_report_shares_user_id ON report_shares (user_id);


CREATE TABLE sources (
	id VARCHAR(100) NOT NULL, 
	data JSON NOT NULL, 
	PRIMARY KEY (id)
)

;


CREATE TABLE student_sensitive_attributes (
	user_id VARCHAR(36) NOT NULL, 
	category_code VARCHAR(80), 
	PRIMARY KEY (user_id)
)

;


CREATE TABLE verification_queue (
	id VARCHAR(100) NOT NULL, 
	run_id VARCHAR(100) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	data JSON NOT NULL, 
	PRIMARY KEY (id)
)

;

CREATE INDEX ix_verification_queue_run_id ON verification_queue (run_id);


CREATE TABLE workspace_records (
	id VARCHAR(100) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	kind VARCHAR(40) NOT NULL, 
	data JSON NOT NULL, 
	created_at VARCHAR(40) NOT NULL, 
	PRIMARY KEY (id)
)

;

CREATE INDEX ix_workspace_owner_kind ON workspace_records (user_id, kind);

CREATE INDEX ix_workspace_records_kind ON workspace_records (kind);

CREATE INDEX ix_workspace_records_user_id ON workspace_records (user_id);

CREATE UNIQUE INDEX one_confirmed_result ON workspace_records (user_id) WHERE kind = 'result' AND data ->> 'confirmation_state' = 'confirmed';


CREATE TABLE offerings (
	id VARCHAR(100) NOT NULL, 
	institution_id VARCHAR(100) NOT NULL, 
	pathway_id VARCHAR(40) NOT NULL, 
	academic_year VARCHAR(10), 
	publish_state VARCHAR(20) NOT NULL, 
	data JSON NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(institution_id) REFERENCES institutions (id)
)

;

CREATE INDEX ix_offerings_academic_year ON offerings (academic_year);

CREATE INDEX ix_offerings_institution_id ON offerings (institution_id);

CREATE INDEX ix_offerings_pathway_id ON offerings (pathway_id);

CREATE INDEX ix_offerings_publish_state ON offerings (publish_state);


CREATE TABLE cutoffs (
	id VARCHAR(100) NOT NULL, 
	offering_id VARCHAR(100) NOT NULL, 
	academic_year VARCHAR(10) NOT NULL, 
	cycle_id VARCHAR(100), 
	data JSON NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(offering_id) REFERENCES offerings (id), 
	FOREIGN KEY(cycle_id) REFERENCES admission_cycles (id)
)

;

CREATE INDEX ix_cutoff_offering_year ON cutoffs (offering_id, academic_year);

CREATE INDEX ix_cutoffs_offering_id ON cutoffs (offering_id);


CREATE TABLE fees (
	id VARCHAR(100) NOT NULL, 
	offering_id VARCHAR(100) NOT NULL, 
	academic_year VARCHAR(10) NOT NULL, 
	data JSON NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(offering_id) REFERENCES offerings (id)
)

;

CREATE INDEX ix_fees_offering_id ON fees (offering_id);