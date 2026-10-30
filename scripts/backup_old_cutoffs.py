"""Make a verified local, recoverable COPY backup before replacing old cutoffs."""
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
from dotenv import dotenv_values
import psycopg
from sqlalchemy.engine import make_url

root = Path(__file__).resolve().parents[1]
settings = dotenv_values(root / '.env')
url = make_url(settings['ADMIN_DATABASE_URL']).set(drivername='postgresql').render_as_string(hide_password=False)
folder = Path('D:/CareerQuest-Backups') / ('before-v11-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
folder.mkdir(parents=True, exist_ok=False)
path = folder / 'cutoffs.copy.gz'
with psycopg.connect(url) as conn:
    conn.execute('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expected = conn.execute('SELECT count(*) FROM public.cutoffs').fetchone()[0]
    with conn.cursor().copy('COPY (SELECT id,offering_id,academic_year,cycle_id,data FROM public.cutoffs ORDER BY id) TO STDOUT') as copy, gzip.open(path, 'wb', compresslevel=6) as out:
        for chunk in copy:
            out.write(chunk)
    conn.rollback()
count = 0
digest = hashlib.sha256()
with gzip.open(path, 'rb') as f:
    for line in f:
        count += 1
        digest.update(line)
if count != expected:
    raise SystemExit('Backup verification failed; cutoff count mismatch.')
(folder / 'receipt.json').write_text(json.dumps({'table': 'public.cutoffs', 'columns': ['id','offering_id','academic_year','cycle_id','data'], 'rows': count, 'copy_sha256': digest.hexdigest()}, indent=2), encoding='utf-8')
print('Verified old cutoff backup:', count, 'rows at', folder)
