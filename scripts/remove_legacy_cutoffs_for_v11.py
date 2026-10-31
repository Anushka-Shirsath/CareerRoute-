"""Remove only the backed-up legacy cutoff table before master replacement."""

import gzip
import hashlib
import json
from pathlib import Path
from dotenv import dotenv_values
import psycopg
from sqlalchemy.engine import make_url

root = Path(__file__).resolve().parents[1]
values = dotenv_values(root / ".env")
folder = sorted(Path("D:/CareerQuest-Backups").glob("before-v11-*"))[-1]
receipt = json.loads((folder / "receipt.json").read_text(encoding="utf8"))
comparison = json.loads((folder / "master-comparison.json").read_text(encoding="utf8"))
digest = hashlib.sha256()
count = 0
with gzip.open(folder / "cutoffs.copy.gz", "rb") as source:
    for line in source:
        digest.update(line)
        count += 1
if (
    count != 633501
    or count != receipt["rows"]
    or digest.hexdigest() != receipt["copy_sha256"]
    or comparison["copy_sha256"] != receipt["copy_sha256"]
    or comparison["differences"] != 0
):
    raise SystemExit("Backup or comparison validation failed; no changes made.")
url = (
    make_url(values["ADMIN_DATABASE_URL"]).set(drivername="postgresql").render_as_string(hide_password=False)
)
with psycopg.connect(url) as conn:
    if conn.execute("SELECT to_regclass('cq_master_v11.institutions') IS NOT NULL").fetchone()[0]:
        raise SystemExit("Master already present; refusing replacement.")
    if conn.execute("SELECT count(*) FROM public.cutoffs").fetchone()[0] != count:
        raise SystemExit("Live cutoff count differs from verified backup; no changes made.")
    conn.execute("DROP TABLE public.cutoffs")
print("Verified legacy cutoff table removed. Student and other catalogue tables are unchanged.")
