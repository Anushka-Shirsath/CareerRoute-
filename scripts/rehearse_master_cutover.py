"""Exercise the same-project master import in an isolated local PostgreSQL."""
import os
import gzip
from pathlib import Path
import subprocess
import sys
import pgserver
import psycopg

root = Path(__file__).resolve().parents[1]
folder = Path(os.environ.get('CQ_REHEARSAL_FOLDER', 'D:/CareerQuest-Test-Work/master-swap-rehearsal-full'))
folder.mkdir(parents=True, exist_ok=True)
server = pgserver.get_server(folder / 'pgdata', cleanup_mode='stop')
try:
    url = server.get_uri()
    with psycopg.connect(url) as c:
        c.execute((root / 'supabase/migrations/0001_core.sql').read_text(encoding='utf-8'))
        c.execute((root / 'supabase/migrations/0002_rls.sql').read_text(encoding='utf-8'))
        backup = sorted(Path('D:/CareerQuest-Backups').glob('catalogue-v11-*'))[-1]
        for name in ('sources','admission_cycles','institutions','offerings'):
            with c.cursor().copy('COPY public.' + name + ' FROM STDIN') as target, gzip.open(backup / (name + '.copy.gz'), 'rb') as source:
                for chunk in iter(lambda: source.read(1024*1024), b''):
                    target.write(chunk)
        c.execute('DROP TABLE public.cutoffs')
    env = os.environ.copy(); env['MASTER_DATABASE_URL'] = url
    importer = 'import_master_psycopg.py' if os.environ.get('CQ_REHEARSAL_PSYCOPG') else 'import_master_v11.py'
    result = subprocess.run([sys.executable, str(root / 'scripts' / importer), '--local-test', '--same-project'], env=env)
    if result.returncode:
        raise SystemExit(result.returncode)
    with psycopg.connect(url) as c:
        print('Master institutions:', c.execute('SELECT count(*) FROM cq_master_v11.institutions').fetchone()[0])
        print('Master cutoffs:', c.execute('SELECT count(*) FROM cq_master_v11.admission_cutoffs').fetchone()[0])
        print('Cutoffs compatibility view:', c.execute("SELECT relkind FROM pg_class WHERE oid='public.cutoffs'::regclass").fetchone()[0])
        print('Local project bytes:', c.execute('SELECT pg_database_size(current_database())').fetchone()[0])
        c.execute('SET LOCAL ROLE cq_student')
        print('Restricted student can query master:', c.execute('SELECT count(*) FROM cq_master_v11.ffc_fee_rows').fetchone()[0])
        print('Restricted student can query cutoff view:', c.execute('SELECT count(*) FROM public.cutoffs').fetchone()[0])
finally:
    server.cleanup()
