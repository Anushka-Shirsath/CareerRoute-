"""Apply the additive account-session migration to the configured Supabase project."""
from pathlib import Path
from urllib.parse import urlparse

from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
values = dotenv_values(ROOT / '.env')
admin = make_url(values['ADMIN_DATABASE_URL'])
project = urlparse(values['SUPABASE_URL']).hostname or ''
project_ref = project.removesuffix('.supabase.co')
if not project.endswith('.supabase.co') or not admin.host or not admin.host.endswith('.pooler.supabase.com') or not (admin.username or '').endswith('.' + project_ref):
    raise SystemExit('Database and authentication settings must refer to the same Supabase project.')
engine = create_engine(admin.set(drivername='postgresql+psycopg'), connect_args={'prepare_threshold': None})
try:
    with engine.begin() as connection:
        with connection.connection.driver_connection.cursor() as cursor:
            cursor.execute((ROOT / 'supabase/migrations/0004_account_sessions.sql').read_text(encoding='utf-8'))
        security = connection.execute(text("""
            SELECT c.relrowsecurity, c.relforcerowsecurity,
              has_table_privilege('anon', c.oid, 'SELECT'),
              has_table_privilege('authenticated', c.oid, 'SELECT'),
              has_table_privilege('cq_system', c.oid, 'SELECT')
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname='account_sessions'
        """)).one()
        if tuple(security) != (True, True, False, False, True):
            raise RuntimeError('Account-session access verification failed; migration rolled back.')
    print('Account-session migration applied; RLS and role access verified.')
finally:
    engine.dispose()
