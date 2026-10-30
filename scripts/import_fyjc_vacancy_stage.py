"""Idempotently stage FYJC vacancy observations; do not publish this dataset."""
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from dotenv import dotenv_values
import psycopg

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = Path(r'C:\Users\Lenovo\Downloads\CareerQuest_MH_After10th_MAIN_20261030-f165a4b2.xlsx')
EXTRACT = Path('D:/CareerQuest-Test-Work/workbook-audit/vacancies.jsonl')
EXPECTED = '3f5154408f5e7207b9f0ea5b047be6e2ee9318e38ccaeb6202681cf4532ecd91'

def main():
    digest = hashlib.sha256(WORKBOOK.read_bytes()).hexdigest()
    if digest != EXPECTED:
        raise ValueError('Workbook checksum changed; do not import this extract.')
    rows = [json.loads(line) for line in EXTRACT.read_text(encoding='utf8').splitlines()]
    if len(rows) != 16861:
        raise ValueError('Unexpected extracted row count.')
    key_counts = defaultdict(set)
    for row in rows:
        if len(row) != 8 or any(not str(v or '').strip() for v in (row[0], row[2], row[3], row[4], row[5])):
            raise ValueError('Missing or invalid record key.')
        if row[3] != '2026-27' or row[4] != 'Special Round 12':
            raise ValueError('Unexpected year or round.')
        if row[6] is not None and (not isinstance(row[6], int) or row[6] < 0):
            raise ValueError('Invalid seat count.')
        key_counts[(row[0], row[2], row[3], row[4], row[5])].add(row[6])
    url = dotenv_values(ROOT / '.env').get('ADMIN_DATABASE_URL')
    if not url:
        raise ValueError('ADMIN_DATABASE_URL is not configured.')
    migration = (ROOT / 'supabase/migrations/0007_private_fyjc_vacancy_stage.sql').read_text(encoding='utf8')
    with psycopg.connect(url, connect_timeout=15) as conn:
        conn.execute(migration)
        conn.execute('CREATE TEMP TABLE staged (LIKE cq_private_stage.fyjc_vacancy_observations INCLUDING DEFAULTS) ON COMMIT DROP')
        with conn.cursor().copy('COPY staged (row_hash,workbook_sha256,udise_code,college_name,stream,academic_year,round_name,seat_category,remaining_seats,note,conflicting_key) FROM STDIN') as copy:
            for row in rows:
                canonical = json.dumps(row, ensure_ascii=False, separators=(',', ':'), default=str)
                record_hash = hashlib.sha256(canonical.encode()).hexdigest()
                conflict = len(key_counts[(row[0], row[2], row[3], row[4], row[5])]) > 1
                copy.write_row((record_hash, digest, *row, conflict))
        inserted = conn.execute('INSERT INTO cq_private_stage.fyjc_vacancy_observations SELECT * FROM staged ON CONFLICT (row_hash) DO NOTHING').rowcount
        total = conn.execute('SELECT count(*) FROM cq_private_stage.fyjc_vacancy_observations WHERE workbook_sha256=%s', (digest,)).fetchone()[0]
        if total != len(rows):
            raise ValueError('Database counts do not reconcile; transaction rolled back.')
        visibility = conn.execute("SELECT has_schema_privilege('cq_public','cq_private_stage','USAGE'), has_schema_privilege('cq_student','cq_private_stage','USAGE')").fetchone()
        if any(visibility):
            raise ValueError('Private staging is accessible to website roles; transaction rolled back.')
    print(f'Imported {inserted} new rows; verified {total} distinct private rows. Public and student roles have no schema access.')

if __name__ == '__main__':
    main()
