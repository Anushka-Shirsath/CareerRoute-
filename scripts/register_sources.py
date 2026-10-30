"""Register source metadata from a CSV with administrator DATABASE_URL.

Required columns: source_id,publisher,url,academic_year,terms_checked.
This does not approve any new extracted factual records.
"""
import argparse
import csv
from pathlib import Path
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/api'))
from app.config import Settings  # noqa: E402
from app.db import make_engine, transaction  # noqa: E402
from app.models import Source  # noqa: E402

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('file')
args = parser.parse_args()
with open(args.file, encoding='utf-8-sig', newline='') as handle:
    rows = list(csv.DictReader(handle))
with transaction(make_engine(Settings().database_url)) as db:
    for row in rows:
        parsed = urlparse(row['url'])
        if parsed.scheme not in {'http', 'https'} or not parsed.netloc or row['terms_checked'] not in {'yes', 'no', 'unclear'}:
            raise ValueError('Invalid source URL or terms status.')
        source_id = row.pop('source_id')
        db.merge(Source(id=source_id, data=row))
print(f'Registered {len(rows)} sources; factual rows still require review.')
