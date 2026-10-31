"""Load the supplied v11.1 snapshot into a separate empty database, atomically.

Set MASTER_DATABASE_URL in .env. The original CareerQuest database is never modified.
Use --local-test only for a disposable local PostgreSQL cluster.
"""

import csv
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

from dotenv import dotenv_values, set_key
from sqlalchemy.engine import make_url
import pgserver
import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path.home() / "Downloads"
DUMP = DOWNLOADS / "careerquest_dump_v11_1_20261030.sql.gz"
CROSSWALK = DOWNLOADS / "crosswalk_candidates_v12_20261030.csv"
JOINS = DOWNLOADS / "confirmed_joins_v12_20261030.jsonl"
EXPECTED_HASH = "eecbc93d91c0146988c6b0ff265cb8569539f5385f0f235ef730a43e8e7342fa"
SCHEMA = "cq_master_v11"
ROLE = "cq_master_reader_v11"


def main():
    values = dotenv_values(ROOT / ".env")
    local = "--local-test" in sys.argv
    same_project = "--same-project" in sys.argv
    connection = (
        os.environ.get("MASTER_DATABASE_URL")
        if local
        else values.get("ADMIN_DATABASE_URL" if same_project else "MASTER_DATABASE_URL")
    )
    if not connection:
        raise SystemExit("MASTER_DATABASE_URL is missing; the existing project is unchanged.")
    url = make_url(connection)
    old = make_url(values["ADMIN_DATABASE_URL"])
    if not local:
        if not url.host or not url.host.endswith(".pooler.supabase.com") or url.port != 5432:
            raise SystemExit("Use the new Supabase Session pooler URL on port 5432.")
        if not same_project and url.username == old.username and url.host == old.host:
            raise SystemExit("Master must be a separate project from the existing database.")
    digest = hashlib.sha256()
    with DUMP.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != EXPECTED_HASH:
        raise SystemExit("Dump checksum mismatch; nothing was imported.")
    with CROSSWALK.open(encoding="utf-8-sig", newline="") as f:
        crosswalk = list(csv.DictReader(f))
    with JOINS.open(encoding="utf-8") as f:
        joins = [json.loads(line) for line in f if line.strip()]
    if (
        len(crosswalk) != 957
        or len(joins) != 70
        or sum(row.get("status") == "JOIN_DUALCODE_OWNING_SOURCE_CONFIRMED" for row in crosswalk) != 70
    ):
        raise SystemExit("Supplement counts do not match the supplied coverage notes.")
    pgurl = url.set(drivername="postgresql").render_as_string(hide_password=False)
    with psycopg.connect(pgurl) as conn:
        exists = conn.execute(
            "select exists(select from pg_namespace where nspname=%s), exists(select from pg_roles where rolname=%s)",
            (SCHEMA, ROLE),
        ).fetchone()
        if any(exists):
            raise SystemExit("Target schema or reader role already exists; refusing to overwrite it.")
        if same_project and conn.execute("select to_regclass('public.cutoffs') is not null").fetchone()[0]:
            raise SystemExit("Old cutoff table must be backed up and removed before same-project import.")
        print("Target checked; beginning one transactional import.", flush=True)
    password = secrets.token_urlsafe(32)
    reader = url.set(
        username=ROLE + ("." + url.username.split(".", 1)[1] if "." in url.username else ""),
        password=password,
    )
    secret = ROOT / "data/private/master-reader-v11.env"
    if secret.exists() and not local:
        raise SystemExit("Reader credentials already exist; refusing to overwrite them.")
    if not local:
        secret.touch(exist_ok=False)
        set_key(str(secret), "MASTER_READER_URL", reader.render_as_string(hide_password=False))
    env = os.environ.copy()
    env.update(
        {
            "PGHOST": url.host or "",
            "PGPORT": str(url.port or 5432),
            "PGUSER": url.username or "",
            "PGPASSWORD": url.password or "",
            "PGDATABASE": url.database or "postgres",
            "PGSSLMODE": url.query.get("sslmode", "require" if not local else "prefer"),
        }
    )
    executable = Path(pgserver.psql.__globals__["POSTGRES_BIN_PATH"]) / "psql.exe"
    logpath = Path("D:/CareerQuest-Test-Work/master-v11-import.log")
    logpath.parent.mkdir(parents=True, exist_ok=True)
    with logpath.open("wb") as log:
        p = subprocess.Popen(
            [str(executable), "-X", "--single-transaction", "-v", "ON_ERROR_STOP=1", "-q"],
            stdin=subprocess.PIPE,
            stdout=log,
            stderr=subprocess.STDOUT,
            env=env,
        )

        def put(text):
            p.stdin.write(text.encode("utf-8"))

        try:
            put(f"CREATE SCHEMA {SCHEMA};\nREVOKE ALL ON SCHEMA {SCHEMA} FROM PUBLIC;\n")
            inside = False
            with gzip.open(DUMP, "rt", encoding="utf-8", newline="") as source:
                for line in source:
                    if not inside:
                        # Rewrite identifiers only in dump commands, never in COPY data.
                        if line.startswith("\\restrict ") or line.startswith("\\unrestrict "):
                            continue  # Older bundled psql does not support these pg_dump markers.
                        if line.startswith("\\"):
                            raise ValueError("Unexpected psql command in dump.")
                        if line.startswith("CREATE UNIQUE INDEX uq_provenance_field "):
                            continue  # Read-only snapshot: avoid a redundant ~45 MB index.
                        line = line.replace("public.", SCHEMA + ".")
                        if line.startswith("SET client_encoding ="):
                            line = "SET client_encoding = 'UTF8';\n"
                        if line.startswith("COPY "):
                            inside = True
                    elif line.strip() == r"\.":
                        inside = False
                    put(line)

            def add_rows(table, rows, columns):
                put(
                    "CREATE TABLE "
                    + SCHEMA
                    + "."
                    + table
                    + " ("
                    + ",".join('"' + c + '" text' for c in columns)
                    + ");\n"
                )
                put(
                    "COPY "
                    + SCHEMA
                    + "."
                    + table
                    + " ("
                    + ",".join('"' + c + '"' for c in columns)
                    + ") FROM STDIN WITH (FORMAT csv, HEADER true);\n"
                )
                out = io.StringIO(newline="")
                writer = csv.DictWriter(out, fieldnames=columns, extrasaction="ignore")
                writer.writeheader()
                writer.writerows(rows)
                put(out.getvalue())
                put("\\.\n")

            add_rows("crosswalk_candidates_v12", crosswalk, list(crosswalk[0]))
            columns = list(dict.fromkeys(k for row in joins for k in row))
            add_rows("confirmed_joins_v12", joins, columns)
            put(
                sql.SQL(
                    "CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD {};\n"
                )
                .format(sql.Identifier(ROLE), sql.Literal(password))
                .as_string()
            )
            put(
                f"GRANT USAGE ON SCHEMA {SCHEMA} TO {ROLE};\nGRANT SELECT ON ALL TABLES IN SCHEMA {SCHEMA} TO {ROLE};\n"
            )
            if same_project:
                put(
                    f"GRANT USAGE ON SCHEMA {SCHEMA} TO cq_public, cq_student;\nGRANT SELECT ON ALL TABLES IN SCHEMA {SCHEMA} TO cq_public, cq_student;\n"
                )
            put(f"""DO $$ DECLARE t record; BEGIN
              FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='{SCHEMA}' LOOP
                EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', '{SCHEMA}', t.tablename);
                EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', '{SCHEMA}', t.tablename);
                EXECUTE format('CREATE POLICY master_reader ON %I.%I FOR SELECT TO {ROLE}' || {"', cq_public, cq_student'" if same_project else "''"} || ' USING (true)', '{SCHEMA}', t.tablename);
              END LOOP;
              IF (SELECT count(*) FROM {SCHEMA}.institutions) <> 16487 OR
                 (SELECT count(*) FROM {SCHEMA}.institution_programs) <> 55060 OR
                 (SELECT count(*) FROM {SCHEMA}.admission_cutoffs) <> 633501 OR
                 (SELECT count(*) FROM {SCHEMA}.ffc_fee_rows) <> 1646 OR
                 (SELECT count(*) FROM {SCHEMA}.crosswalk_candidates_v12) <> 957 OR
                 (SELECT count(*) FROM {SCHEMA}.confirmed_joins_v12) <> 70 THEN
                RAISE EXCEPTION 'Master row counts did not match';
              END IF;
            END $$;\n""")
            for table, expected in {
                "admission_cutoffs": 633501,
                "admission_cycles": 33,
                "build_meta": 7,
                "classification_meanings": 4,
                "coverage_stats": 162,
                "crosswalk_candidates": 957,
                "data_provenance": 728043,
                "districts": 37,
                "extraction_jobs": 9,
                "ffc_fee_rows": 1646,
                "ffc_orders": 40,
                "institute_review_hostel_harvest": 29,
                "institution_identifiers": 16487,
                "institution_programs": 55060,
                "institutions": 16487,
                "poly_allotment_by_candidate_category": 240707,
                "poly_allotment_by_seat_type": 191778,
                "poly_allotment_pairs": 1796,
                "programs": 803,
                "scholarship_schemes": 55,
                "seat_matrices": 273444,
                "source_documents": 469,
                "verification_queue": 3712,
                "crosswalk_candidates_v12": 957,
                "confirmed_joins_v12": 70,
            }.items():
                put(
                    f"DO $$ BEGIN IF (SELECT count(*) FROM {SCHEMA}.{table}) <> {expected} THEN RAISE EXCEPTION 'Row count mismatch: {table}'; END IF; END $$;\n"
                )
            for table in ("fee_structures", "hostel_facilities", "extraction_errors"):
                put(
                    f"DO $$ BEGIN IF (SELECT count(*) FROM {SCHEMA}.{table}) <> 0 THEN RAISE EXCEPTION 'Expected empty table: {table}'; END IF; END $$;\n"
                )
            if same_project:
                put(f"""CREATE VIEW public.cutoffs WITH (security_invoker=true) AS
                  SELECT 'dump:' || c.id::text AS id, 'dump:' || c.institution_program_id::text AS offering_id,
                    cy.data->>'academic_year' AS academic_year, 'dump:' || c.cycle_id::text AS cycle_id,
                    json_build_object('category',c.category,'quota',NULL,'reservation_details',c.reservation_details,
                      'raw_value',c.cutoff_value_raw,'numeric_value',c.cutoff_value_num,'merit_metric',c.measurement_type,
                      'scale',c.scale,'extra_dimensions','{{}}'::json) AS data
                  FROM {SCHEMA}.admission_cutoffs c
                  JOIN public.admission_cycles cy ON cy.id='dump:' || c.cycle_id::text
                  JOIN public.offerings o ON o.id='dump:' || c.institution_program_id::text;
                  GRANT SELECT ON public.cutoffs TO cq_public,cq_student;
                """)
            p.stdin.close()
            result = p.wait()
        except (BrokenPipeError, OSError):
            result = p.wait()
    if result:
        raise SystemExit("Import failed and was rolled back. See " + str(logpath))
    if not local:
        set_key(str(ROOT / ".env"), "MASTER_READER_URL", reader.render_as_string(hide_password=False))
    print("Full master and supplements imported with restricted reader access.")


if __name__ == "__main__":
    main()
