"""Keep a verified local backup of the legacy catalogue before replacement."""

from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
from dotenv import dotenv_values
import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

root = Path(__file__).resolve().parents[1]
settings = dotenv_values(root / ".env")
url = (
    make_url(settings["ADMIN_DATABASE_URL"])
    .set(drivername="postgresql")
    .render_as_string(hide_password=False)
)
folder = Path("D:/CareerQuest-Backups") / (
    "catalogue-v11-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
)
folder.mkdir(parents=True, exist_ok=False)
tables = [
    "institutions",
    "offerings",
    "sources",
    "admission_cycles",
    "fees",
    "import_runs",
    "verification_queue",
    "publication_history",
]
result = {}
with psycopg.connect(url) as conn:
    conn.execute("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    for name in tables:
        expected = conn.execute(
            sql.SQL("SELECT count(*) FROM public.{}").format(sql.Identifier(name))
        ).fetchone()[0]
        path = folder / (name + ".copy.gz")
        with (
            conn.cursor().copy(sql.SQL("COPY public.{} TO STDOUT").format(sql.Identifier(name))) as source,
            gzip.open(path, "wb") as out,
        ):
            for chunk in source:
                out.write(chunk)
        count = 0
        digest = hashlib.sha256()
        with gzip.open(path, "rb") as f:
            for line in f:
                count += 1
                digest.update(line)
        if count != expected:
            raise RuntimeError("Backup row count mismatch for " + name)
        result[name] = {"rows": count, "copy_sha256": digest.hexdigest()}
    conn.rollback()
(folder / "receipt.json").write_text(json.dumps(result, indent=2), encoding="utf8")
print("Verified backup of", len(tables), "catalogue tables at", folder)
