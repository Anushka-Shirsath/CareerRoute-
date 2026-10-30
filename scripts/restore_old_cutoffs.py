"""Restore the verified legacy cutoff table after an interrupted v11 cutover."""
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
folder = sorted(Path('D:/CareerQuest-Backups').glob('before-v11-*'))[-1]
receipt = json.loads((folder / 'receipt.json').read_text(encoding='utf-8'))
path = folder / 'cutoffs.copy.gz'
digest, count = hashlib.sha256(), 0
with gzip.open(path, 'rb') as source:
    for line in source:
        digest.update(line); count += 1
if count != receipt['rows'] or digest.hexdigest() != receipt['copy_sha256']:
    raise SystemExit('Backup verification failed; refusing to restore.')
with psycopg.connect(url) as conn:
    if conn.execute("select to_regclass('public.cutoffs') is not null").fetchone()[0]:
        raise SystemExit('public.cutoffs already exists; refusing to overwrite it.')
    conn.execute("""CREATE TABLE public.cutoffs (id varchar(100) PRIMARY KEY, offering_id varchar(100) NOT NULL REFERENCES public.offerings(id), academic_year varchar(10) NOT NULL, cycle_id varchar(100) REFERENCES public.admission_cycles(id), data json NOT NULL)""")
    with conn.cursor().copy('COPY public.cutoffs (id,offering_id,academic_year,cycle_id,data) FROM STDIN') as target, gzip.open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024*1024), b''):
            target.write(chunk)
    conn.execute('CREATE INDEX ix_cutoff_offering_year ON public.cutoffs (offering_id,academic_year)')
    conn.execute('CREATE INDEX ix_cutoffs_offering_id ON public.cutoffs (offering_id)')
    conn.execute('ALTER TABLE public.cutoffs ENABLE ROW LEVEL SECURITY')
    conn.execute('ALTER TABLE public.cutoffs FORCE ROW LEVEL SECURITY')
    conn.execute("CREATE POLICY cutoff_published ON public.cutoffs FOR SELECT TO cq_public,cq_student USING (EXISTS (SELECT 1 FROM public.offerings o WHERE o.id=offering_id AND o.publish_state='published'))")
    conn.execute('GRANT SELECT ON public.cutoffs TO cq_public,cq_student')
    if conn.execute('SELECT count(*) FROM public.cutoffs').fetchone()[0] != count:
        raise RuntimeError('Restored count mismatch; transaction rolled back.')
print('Restored and verified', count, 'legacy cutoff rows.')
