"""Compare a verified legacy backup against the restored master in local PostgreSQL."""
import gzip
import json
from pathlib import Path
import pgserver
import psycopg

backup = sorted(Path('D:/CareerQuest-Backups').glob('before-v11-*/cutoffs.copy.gz'))[-1]
server = pgserver.get_server('D:/CareerQuest-Test-Work/master-v11-inspection/pgdata', cleanup_mode='stop')
try:
    with psycopg.connect(server.get_uri()) as conn:
        conn.execute('CREATE SCHEMA IF NOT EXISTS legacy_verification')
        present = conn.execute("SELECT to_regclass('legacy_verification.cutoffs') IS NOT NULL").fetchone()[0]
        if not present:
            conn.execute('CREATE UNLOGGED TABLE legacy_verification.cutoffs (id text, offering_id text, academic_year text, cycle_id text, data jsonb)')
            with conn.cursor().copy('COPY legacy_verification.cutoffs FROM STDIN') as writer, gzip.open(backup, 'rb') as source:
                for chunk in iter(lambda: source.read(1024*1024), b''):
                    writer.write(chunk)
            conn.execute('CREATE INDEX ON legacy_verification.cutoffs (id)')
        differences = conn.execute("""
          SELECT count(*) FROM legacy_verification.cutoffs l
          FULL JOIN cq_master_v11.admission_cutoffs m ON l.id = 'dump:' || m.id::text
          LEFT JOIN cq_master_v11.admission_cycles cy ON cy.cycle_id=m.cycle_id
          WHERE l.id IS NULL OR m.id IS NULL
             OR l.offering_id IS DISTINCT FROM 'dump:' || m.institution_program_id::text
             OR l.cycle_id IS DISTINCT FROM 'dump:' || m.cycle_id::text
             OR l.academic_year IS DISTINCT FROM cy.academic_year
             OR l.data->>'category' IS DISTINCT FROM m.category
             OR l.data->>'raw_value' IS DISTINCT FROM m.cutoff_value_raw
             OR l.data->>'merit_metric' IS DISTINCT FROM m.measurement_type
             OR (l.data->>'numeric_value')::numeric IS DISTINCT FROM m.cutoff_value_num
        """).fetchone()[0]
        print('Legacy rows:', conn.execute('SELECT count(*) FROM legacy_verification.cutoffs').fetchone()[0])
        print('Mismatched cutoff rows:', differences)
        if differences:
            raise SystemExit('Cutoff data differs; retain the old table and investigate.')
        receipt = json.loads((backup.parent / 'receipt.json').read_text(encoding='utf8'))
        (backup.parent / 'master-comparison.json').write_text(json.dumps({'rows': receipt['rows'], 'copy_sha256': receipt['copy_sha256'], 'master_sha256': 'eecbc93d91c0146988c6b0ff265cb8569539f5385f0f235ef730a43e8e7342fa', 'differences': differences}, indent=2), encoding='utf8')
        print('Cutoff rows match the master for the compared fields.')
finally:
    server.cleanup()
