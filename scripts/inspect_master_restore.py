"""Restore the user-provided master to an isolated local PostgreSQL for sizing."""
import gzip
from pathlib import Path
import subprocess
import pgserver
import psycopg
POSTGRES_BIN_PATH = pgserver.psql.__globals__['POSTGRES_BIN_PATH']

root = Path('D:/CareerQuest-Test-Work/master-v11-inspection')
root.mkdir(parents=True, exist_ok=True)
server = pgserver.get_server(root / 'pgdata', cleanup_mode='stop')
url = server.get_uri()
source = Path('C:/Users/Lenovo/Downloads/careerquest_dump_v11_1_20261030.sql.gz')
try:
    with gzip.open(source, 'rb') as dump, (root / 'restore.log').open('wb') as log:
        proc = subprocess.Popen([str(POSTGRES_BIN_PATH / 'psql.exe'), '-X', '-v', 'ON_ERROR_STOP=1', '-q', url], stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT)
        try:
            for chunk in iter(lambda: dump.read(1024 * 1024), b''):
                proc.stdin.write(chunk)
            proc.stdin.close()
            code = proc.wait()
        except BrokenPipeError:
            code = proc.wait()
    if code:
        print('Restore failed; see', root / 'restore.log')
        raise SystemExit(code)
    with psycopg.connect(url) as conn:
        print('restored_database_bytes', conn.execute('select pg_database_size(current_database())').fetchone()[0])
        print('restored_table_bytes', conn.execute("select sum(pg_total_relation_size(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'").fetchone()[0])
        for table in ['institutions', 'institution_programs', 'admission_cutoffs', 'ffc_fee_rows', 'poly_allotment_by_seat_type']:
            print(table, conn.execute('select count(*) from ' + table).fetchone()[0])
finally:
    server.cleanup()
