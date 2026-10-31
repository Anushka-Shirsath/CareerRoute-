"""Attach verified v11 district provenance to existing published directory records."""

import json
import os
from pathlib import Path
import sys
from dotenv import dotenv_values
import psycopg
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api"))
from app.catalogue import district_name  # noqa: E402

v = dotenv_values(ROOT / ".env")
connection = (
    os.environ.get("MASTER_ACTIVATION_URL") if "--local-test" in sys.argv else v["ADMIN_DATABASE_URL"]
)
url = make_url(connection).set(drivername="postgresql").render_as_string(hide_password=False)
with psycopg.connect(url) as conn:
    if conn.execute("SELECT to_regclass('cq_master_v11.institutions') IS NOT NULL").fetchone()[0] is not True:
        raise SystemExit("Master schema not present.")
    sources = conn.execute(
        "SELECT source_id,source_system,url,fetched_at,content_sha256,http_status,notes FROM cq_master_v11.source_documents"
    ).fetchall()
    source_rows = []
    for source_id, publisher, source_url, fetched, sha, status, notes in sources:
        data = {
            "url": source_url,
            "publisher": publisher,
            "retrieved_at": str(fetched) if fetched else None,
            "sha256": sha,
            "http_status": status,
            "academic_year": None,
            "terms_checked": "unclear",
            "notes": notes,
        }
        source_rows.append(("dump:" + str(source_id), json.dumps(data)))
    with conn.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO public.sources (id,data) VALUES (%s,%s::json) ON CONFLICT (id) DO NOTHING",
            source_rows,
        )
        added = cursor.rowcount
    rows = conn.execute("""SELECT DISTINCT i.institution_id,d.name,i.district_method,p.source_id
        FROM cq_master_v11.institutions i JOIN cq_master_v11.districts d USING(district_id)
        JOIN cq_master_v11.data_provenance p ON p.table_name='institutions' AND p.record_id=i.institution_id AND p.field_name='district'
        WHERE i.pathway='polytechnic' AND i.data_status='verified' AND i.district_method='dte_fclist_code_match'""").fetchall()
    updates = []
    for ident, raw_district, method, source_id in rows:
        name = district_name(raw_district)
        if not name:
            continue
        patch = json.dumps({"district_source_id": "dump:" + str(source_id), "district_method": method})
        updates.append((name, patch, "dump:" + str(ident)))
    with conn.cursor() as cursor:
        cursor.executemany(
            "UPDATE public.institutions SET district=%s,data=(data::jsonb || %s::jsonb)::json WHERE id=%s AND pathway='polytechnic'",
            updates,
        )
        updated = cursor.rowcount
    print("Added master source records:", added)
    print("Polytechnic institution districts updated from verified provenance:", updated)
