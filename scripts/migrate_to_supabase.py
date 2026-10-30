"""Copy a consistent SQLite snapshot to an empty Supabase PostgreSQL database.

Pause API writes before --apply and keep them paused until the verified cutover.
No arguments prints an inventory only. Secrets are read/written locally, never
printed. The import is transactional and refuses existing application objects.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys

from dotenv import dotenv_values, load_dotenv, set_key
import psycopg
from psycopg import sql
from sqlalchemy import Boolean, JSON
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/api'))
from app.models import Base  # noqa: E402

TABLES = list(Base.metadata.sorted_tables)
MODULUS = 2 ** 256


def snapshot(source_path, backup_path):
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    if backup_path.exists():
        raise ValueError('Refusing to overwrite a backup.')
    with sqlite3.connect(source_path.as_uri() + '?mode=ro', uri=True) as source:
        with sqlite3.connect(backup_path) as target:
            source.backup(target)
            if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('SQLite backup integrity check failed.')


def normalise(table, row, sqlite=False):
    values = list(row)
    for index, column in enumerate(table.columns):
        value = values[index]
        if value is not None and isinstance(column.type, Boolean):
            values[index] = bool(value)
        elif value is not None and sqlite and isinstance(column.type, JSON):
            values[index] = json.loads(value)
    return values


def row_hash(values):
    encoded = json.dumps(values, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
    return int.from_bytes(hashlib.sha256(encoded).digest(), 'big')


def sqlite_query(table):
    # Names originate exclusively in the application's SQLAlchemy metadata.
    columns = ','.join('"' + c.name + '"' for c in table.columns)
    return f'SELECT {columns} FROM "{table.name}"'


def migrate(source_path, admin_url, password, max_database_bytes=450_000_000, progress=print):
    if len(password) < 24:
        raise ValueError('The restricted API password must have at least 24 characters.')
    tables_report = {}
    with sqlite3.connect(source_path.as_uri() + '?mode=ro', uri=True) as source:
        with psycopg.connect(admin_url, connect_timeout=15, prepare_threshold=None) as target:
            target.execute("SET LOCAL lock_timeout = '10s'")
            target.execute("SET LOCAL statement_timeout = '20min'")
            target.execute("SELECT pg_advisory_xact_lock(hashtext('careerquest_initial_import'))")
            existing = {r[0] for r in target.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")}
            if existing:
                raise ValueError('The destination public schema is not empty; refusing to overwrite or mix data.')
            existing_roles = target.execute("SELECT rolname FROM pg_roles WHERE rolname IN ('cq_api','cq_public','cq_student','cq_system')").fetchall()
            if existing_roles:
                raise ValueError('CareerQuest roles already exist; inspect the prior migration before retrying.')
            before_size = target.execute('SELECT pg_database_size(current_database())').fetchone()[0]
            if before_size > max_database_bytes:
                raise ValueError('Destination already exceeds the configured free-plan safety budget.')
            for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
                target.execute(migration.read_text(encoding='utf-8'))
            target.execute(sql.SQL('CREATE ROLE cq_api LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD {}').format(sql.Literal(password)))
            target.execute('GRANT cq_public, cq_student, cq_system TO cq_api')
            for table in TABLES:
                expected_count = 0
                expected_digest = 0
                columns = sql.SQL(',').join(sql.Identifier(c.name) for c in table.columns)
                copy_sql = sql.SQL('COPY public.{} ({}) FROM STDIN').format(sql.Identifier(table.name), columns)
                with target.cursor().copy(copy_sql) as copier:
                    for row in source.execute(sqlite_query(table)):
                        values = list(row)
                        for index, column in enumerate(table.columns):
                            if values[index] is not None and isinstance(column.type, Boolean):
                                values[index] = bool(values[index])
                        copier.write_row(values)
                        expected_digest = (expected_digest + row_hash(normalise(table, row, sqlite=True))) % MODULUS
                        expected_count += 1
                        if expected_count % 100000 == 0:
                            progress(f'{table.name}: copied {expected_count:,} rows')
                actual_count = 0
                actual_digest = 0
                query = sql.SQL('SELECT {} FROM public.{}').format(columns, sql.Identifier(table.name))
                with target.cursor(name='verify_' + table.name) as cursor:
                    cursor.itersize = 2000
                    cursor.execute(query)
                    for row in cursor:
                        actual_digest = (actual_digest + row_hash(normalise(table, row))) % MODULUS
                        actual_count += 1
                if (actual_count, actual_digest) != (expected_count, expected_digest):
                    raise ValueError(f'Full-row checksum mismatch in {table.name}; import rolled back.')
                tables_report[table.name] = {'rows': actual_count, 'sha256_multiset_sum': f'{actual_digest:064x}'}
                progress(f'{table.name}: {actual_count:,} rows copied and verified')
            flags = target.execute("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='public' AND relkind='r'").fetchall()
            if len(flags) != len(TABLES) or not all(enabled and forced for _, enabled, forced in flags):
                raise ValueError('Every application table must enforce row-level security.')
            final_size = target.execute('SELECT pg_database_size(current_database())').fetchone()[0]
            if final_size > max_database_bytes:
                raise ValueError('Import exceeds the free-plan safety budget; rolling back without upgrading.')
    return {'tables': tables_report, 'database_size_before_bytes': before_size, 'database_size_after_bytes': final_size, 'all_rows_verified': True, 'all_tables_force_rls': True}


def restricted_url(admin_url, password):
    url = make_url(admin_url)
    user = 'cq_api'
    if url.host and url.host.endswith('.pooler.supabase.com'):
        if not url.username or '.' not in url.username:
            raise ValueError('The shared pooler username must include the Supabase project reference.')
        user += '.' + url.username.split('.', 1)[1]
    return url.set(drivername='postgresql+psycopg', username=user, password=password).render_as_string(hide_password=False)


def verify_restricted(api_url):
    uri = api_url.replace('postgresql+psycopg://', 'postgresql://', 1)
    with psycopg.connect(uri, connect_timeout=15, prepare_threshold=None) as db:
        flags = db.execute('SELECT rolsuper,rolinherit,rolbypassrls FROM pg_roles WHERE rolname=current_user').fetchone()
        if flags != (False, False, False):
            raise ValueError('API login must be non-superuser, NOINHERIT and NOBYPASSRLS.')
        db.execute('SET LOCAL ROLE cq_public')
        published = db.execute('SELECT count(*) FROM institutions').fetchone()[0]
        db.execute('SET LOCAL ROLE cq_student')
        db.execute("SELECT set_config('app.user_id', %s, true)", ('migration-check-' + secrets.token_hex(8),))
        for name in ['workspace_records', 'student_sensitive_attributes', 'domain_events', 'report_shares', 'rate_counters']:
            if db.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(name))).fetchone()[0]:
                raise ValueError('A fresh owner can see another workspace.')
        db.execute('SET LOCAL ROLE cq_system')
        db.execute('SELECT count(*) FROM guest_sessions').fetchone()
        try:
            with db.transaction():
                db.execute('SELECT * FROM workspace_records LIMIT 1')
        except psycopg.errors.InsufficientPrivilege:
            pass
        else:
            raise ValueError('Session/share resolver must not access workspace records.')
    return {'restricted_login_verified': True, 'fresh_owner_sees_no_private_rows': True, 'system_has_no_workspace_access': True, 'published_institutions': published}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Import into the configured empty project. Does not switch the running API.')
    args = parser.parse_args()
    source = ROOT / 'data/private/careerquest.db'
    if not args.apply:
        with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as db:
            print(json.dumps({t.name: db.execute('SELECT count(*) FROM "' + t.name + '"').fetchone()[0] for t in TABLES}, indent=2))
        print('Pause API writes, then run with --apply. The local database is preserved.')
        return
    load_dotenv(ROOT / '.env')
    admin_url = os.environ.get('ADMIN_DATABASE_URL')
    if not admin_url:
        raise ValueError('Set ADMIN_DATABASE_URL in the root .env file first.')
    parsed = make_url(admin_url)
    if not parsed.host or not parsed.host.endswith(('.supabase.com', '.supabase.co')):
        raise ValueError('The configured destination is not a Supabase database host.')
    candidate = ROOT / 'data/private/supabase-api.env'
    if candidate.exists():
        raise ValueError('Restricted credentials already exist. Inspect the previous import before retrying.')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = ROOT / f'data/private/backups/careerquest-cutover-{stamp}.db'
    snapshot(source, backup)
    password = secrets.token_urlsafe(36)
    api_url = restricted_url(admin_url, password)
    candidate.touch(exist_ok=False)
    set_key(candidate, 'DATABASE_URL', api_url)
    settings = dotenv_values(ROOT / '.env')
    pepper = settings.get('SHARE_TOKEN_PEPPER') or (ROOT / 'data/private/server-secret.txt').read_text().strip()
    set_key(candidate, 'SHARE_TOKEN_PEPPER', pepper)
    report = migrate(backup, admin_url, password, progress=lambda message: print(message, flush=True))
    report.update(verify_restricted(api_url))
    report.update({'created_at_utc': stamp, 'project_ref': parsed.username.split('.', 1)[-1], 'backup': str(backup.relative_to(ROOT)), 'active_database_changed': False})
    receipt = ROOT / 'data/private/supabase-migration.json'
    receipt.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('Migration and restricted-role checks passed. Credentials and receipt are saved under data/private. The active API has not been switched.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Migration stopped: {type(error).__name__}; SQLSTATE={getattr(error, "sqlstate", None)}. No automatic cutover was performed.', file=sys.stderr)
        sys.exit(1)
