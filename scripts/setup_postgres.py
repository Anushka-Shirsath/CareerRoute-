"""Apply the schema, RLS and restricted API role with administrator credentials.

Credentials come from environment variables, never command-line arguments or logs.
Use once against an empty project. Does not restore or execute the supplied dump.
"""
import os
from pathlib import Path
import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
admin_url = os.environ['ADMIN_DATABASE_URL']
password = os.environ['CQ_API_PASSWORD']
if len(password) < 24:
    raise ValueError('CQ_API_PASSWORD must have at least 24 characters.')
with psycopg.connect(admin_url, autocommit=False) as db:
    for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
        db.execute(migration.read_text(encoding='utf-8'))
    db.execute(sql.SQL('CREATE ROLE cq_api LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD {}').format(sql.Literal(password)))
    db.execute('GRANT cq_public, cq_student, cq_system TO cq_api')
print('Schema, RLS and restricted cq_api login created.')
