"""Exercise the actual copy/checksum/cutover-role helpers on local PostgreSQL."""
import importlib.util
from pathlib import Path
import secrets
import sqlite3

import psycopg
import pytest
from app.db import make_engine, transaction
from app.config import Settings
from app.main import create_app
from app.models import Record, Share
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location('supabase_migration', ROOT / 'scripts/migrate_to_supabase.py')
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


@pytest.fixture
def destination(tmp_path):
    pgserver = pytest.importorskip('pgserver')
    server = pgserver.get_server(tmp_path / 'pg', cleanup_mode='stop')
    try:
        yield server.get_uri()
    finally:
        server.cleanup()


def test_copy_preserves_json_boolean_private_rows_and_refuses_repeat(engine, destination, tmp_path):
    with transaction(engine) as db:
        db.add(Record(id='private-check', user_id='owner-one', kind='test', data={'text': 'मराठी / apostrophe: \' / \\ / newline\n', 'empty': None}, created_at='2026-10-29'))
        db.add(Share(id='share-check', user_id='owner-one', report_id='report-check', token_hash='hash-check', expires_at='2027-01-01', revoked=True, snapshot={'bool': False, 'list': [1, None, 2.5]}))
    source = Path(engine.url.database).resolve()
    backup = tmp_path / 'backup.db'
    migration.snapshot(source, backup)
    password = secrets.token_urlsafe(36)
    report = migration.migrate(backup, destination, password, progress=lambda _: None)
    assert report['all_rows_verified'] and report['all_tables_force_rls']
    assert report['tables']['workspace_records']['rows'] == 1
    assert report['tables']['fees']['rows'] == 1
    verified = migration.verify_restricted(migration.restricted_url(destination, password))
    assert verified['published_institutions'] == 2
    api_engine = make_engine(migration.restricted_url(destination, password), pool_size=1)
    settings = Settings(environment='development', mentor_enabled=False, share_token_pepper='test-pepper-at-least-32-characters')
    with TestClient(create_app(settings, api_engine)) as client:
        assert client.get('/health').status_code == 200
        assert client.post('/api/v1/session').status_code == 200
        assert client.post('/api/v1/session/demo').status_code == 200
        assert client.delete('/api/v1/me').status_code == 200
    api_engine.dispose()
    pooled = make_engine(migration.restricted_url(destination, password), pool_size=1)
    from sqlalchemy import text
    with pooled.begin() as db:
        first_pid = db.scalar(text('SELECT pg_backend_pid()'))
        db.execute(text('SET LOCAL ROLE cq_student'))
        db.execute(text("SELECT set_config('app.user_id','owner-one',true)"))
        assert db.scalar(text('SELECT count(*) FROM workspace_records')) == 1
    with pooled.begin() as db:
        assert db.scalar(text('SELECT pg_backend_pid()')) == first_pid
        assert db.scalar(text('SELECT current_user')) == 'cq_api'
        assert db.scalar(text("SELECT current_setting('app.user_id',true)")) in ('', None)
        db.execute(text('SET LOCAL ROLE cq_student'))
        db.execute(text("SELECT set_config('app.user_id','owner-two',true)"))
        assert db.scalar(text('SELECT count(*) FROM workspace_records')) == 0
    pooled.dispose()
    with psycopg.connect(destination) as db:
        assert db.execute("SELECT revoked FROM report_shares WHERE id='share-check'").fetchone() == (True,)
    with pytest.raises(ValueError, match='not empty'):
        migration.migrate(backup, destination, password)
    with sqlite3.connect(source) as db:
        assert db.execute('SELECT count(*) FROM workspace_records').fetchone()[0] == 1


def test_checksum_mismatch_rolls_back_schema_roles_and_rows(engine, destination, tmp_path, monkeypatch):
    backup = tmp_path / 'backup.db'
    migration.snapshot(Path(engine.url.database).resolve(), backup)
    original = migration.normalise

    def corrupt(table, row, sqlite=False):
        values = original(table, row, sqlite)
        if not sqlite:
            values[0] = 'corrupted'
        return values

    monkeypatch.setattr(migration, 'normalise', corrupt)
    with pytest.raises(ValueError, match='checksum mismatch'):
        migration.migrate(backup, destination, secrets.token_urlsafe(36), progress=lambda _: None)
    with psycopg.connect(destination) as db:
        assert db.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'").fetchall() == []
        assert db.execute("SELECT rolname FROM pg_roles WHERE rolname='cq_api'").fetchall() == []


def test_pooler_username_keeps_project_reference_and_encodes_api_password():
    from sqlalchemy.engine import make_url
    result = make_url(migration.restricted_url('postgresql://postgres.example:admin@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require', 'restricted:@/password-with-24-plus-characters'))
    assert result.username == 'cq_api.example'
    assert result.password == 'restricted:@/password-with-24-plus-characters'
    assert result.query['sslmode'] == 'require'
