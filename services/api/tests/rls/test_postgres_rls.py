"""Real PostgreSQL policies, not mocked owner filters.

Set TEST_POSTGRES_URL to a disposable empty test database, or install pgserver
on Python 3.11/3.12 to start an embedded disposable PostgreSQL locally.
"""
import os
from pathlib import Path
import secrets
import pytest
from fastapi.testclient import TestClient
import psycopg
from psycopg import sql
from app.config import Settings
from app.db import make_engine
from app.main import create_app

ROOT = Path(__file__).resolve().parents[4]


@pytest.fixture(scope='module')
def postgres_url(tmp_path_factory):
    provided = os.environ.get('TEST_POSTGRES_URL')
    pg = None
    if provided:
        url = provided
    else:
        pgserver = pytest.importorskip('pgserver', reason='Install pgserver or set TEST_POSTGRES_URL to run real PostgreSQL RLS tests.')
        pg = pgserver.get_server(tmp_path_factory.mktemp('postgres'), cleanup_mode='stop')
        url = pg.get_uri()
    # A fresh database per module makes the suite repeatable without dropping
    # existing schemas or changing any production catalogue.
    db_name = 'cq_test_' + secrets.token_hex(6)
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(db_name)))
    from psycopg.conninfo import conninfo_to_dict, make_conninfo
    params = conninfo_to_dict(url)
    params['dbname'] = db_name
    isolated = make_conninfo(**params)
    with psycopg.connect(isolated) as conn:
        conn.execute((ROOT / 'supabase/migrations/0001_core.sql').read_text(encoding='utf-8'))
        conn.execute((ROOT / 'supabase/migrations/0002_rls.sql').read_text(encoding='utf-8'))
        conn.execute((ROOT / 'supabase/migrations/0004_account_sessions.sql').read_text(encoding='utf-8'))
    yield isolated
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(db_name)))
    if pg:
        pg.cleanup()


def as_student(conn, owner):
    conn.execute('SET LOCAL ROLE cq_student')
    conn.execute("SELECT set_config('app.user_id', %s, true)", (owner,))


@pytest.mark.parametrize('table,columns,values', [
    ('workspace_records', 'id,user_id,kind,data,created_at', "'rls-a','owner-a','result','{}','2026-01-01'"),
    ('student_sensitive_attributes', 'user_id,category_code', "'owner-a','OPEN'"),
    ('domain_events', 'id,user_id,event_type,entity_id,revision,created_at', "'rls-event','owner-a','RESULT_CONFIRMED','rls-a',1,'2026-01-01'"),
    ('report_shares', 'id,user_id,report_id,token_hash,expires_at,revoked,snapshot', "'rls-share','owner-a','report-a','hash-a','2099-01-01',false,'{}'"),
    ('rate_counters', 'user_id,bucket,count', "'owner-a','test',1"),
])
def test_rls_isolation_all_tables(postgres_url, table, columns, values):
    with psycopg.connect(postgres_url) as conn:
        as_student(conn, 'owner-a')
        conn.execute(f'INSERT INTO {table} ({columns}) VALUES ({values})')
    with psycopg.connect(postgres_url) as conn:
        as_student(conn, 'owner-b')
        assert conn.execute(f'SELECT * FROM {table}').fetchall() == []
        assert conn.execute(f'DELETE FROM {table}').rowcount == 0
    with psycopg.connect(postgres_url) as conn:
        as_student(conn, 'owner-a')
        assert len(conn.execute(f'SELECT * FROM {table}').fetchall()) == 1
        conn.execute(f'DELETE FROM {table}')


def test_catalogue_not_writable_by_users(postgres_url):
    with psycopg.connect(postgres_url) as conn:
        as_student(conn, 'owner-a')
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("INSERT INTO sources(id,data) VALUES ('evil','{}')")


def test_cannot_impersonate_owner_on_insert(postgres_url):
    with psycopg.connect(postgres_url) as conn:
        as_student(conn, 'owner-b')
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("INSERT INTO workspace_records(id,user_id,kind,data,created_at) VALUES ('evil','owner-a','result','{}','2026-01-01')")


def test_system_role_cannot_read_workspace(postgres_url):
    with psycopg.connect(postgres_url) as conn:
        conn.execute('SET LOCAL ROLE cq_system')
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute('SELECT * FROM workspace_records')


def test_full_api_uses_restricted_postgres_role(postgres_url):
    from psycopg.conninfo import conninfo_to_dict
    from sqlalchemy.engine import URL
    name = 'cq_api_test_' + secrets.token_hex(4)
    password = secrets.token_urlsafe(32)
    with psycopg.connect(postgres_url) as conn:
        conn.execute(sql.SQL('CREATE ROLE {} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD {}').format(sql.Identifier(name), sql.Literal(password)))
        conn.execute(sql.SQL('GRANT cq_public,cq_student,cq_system TO {}').format(sql.Identifier(name)))
    params = conninfo_to_dict(postgres_url)
    url = URL.create('postgresql+psycopg', username=name, password=password, host=params.get('host', 'localhost'), port=int(params.get('port', 5432)), database=params.get('dbname', 'postgres'))
    engine = make_engine(url.render_as_string(hide_password=False))
    app = create_app(Settings(environment='production', database_url=url.render_as_string(hide_password=False), public_api_origin='https://test.example', cookie_secure=True, share_token_pepper='test-pepper-at-least-32-characters', mentor_enabled=False), engine)
    with TestClient(app, base_url='https://test.example') as client:
        response = client.post('/api/v1/session')
        assert response.status_code == 200, response.text
        demo = client.post('/api/v1/session/demo')
        assert demo.status_code == 200, demo.text
        result_id = demo.json()['data']['result_id']
        confirmation = client.put(f'/api/v1/results/{result_id}/confirm', json={'confirm': True})
        assert confirmation.status_code == 200, confirmation.text
        shared = client.post('/api/v1/parent-reports', json={'sections': ['next_steps']})
        assert shared.status_code == 200, shared.text
        assert client.delete('/api/v1/me').status_code == 200
    engine.dispose()
