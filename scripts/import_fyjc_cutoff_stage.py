"""Stage only workbook cutoff observations missing from the existing master."""

import hashlib
import json
from pathlib import Path
from dotenv import dotenv_values
import psycopg

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = Path(r"C:\Users\Lenovo\Downloads\CareerQuest_MH_After10th_CUTOFFS_2025-26_20261030-9074b304.xlsx")
UNMATCHED = Path("D:/CareerQuest-Test-Work/workbook-audit/unmatched_cutoffs.jsonl")
EXPECTED = "e61bb298ef24b2deb29b26bafc7ba6bf5b4c7ea4076ce48c834fee fa5439e69b".replace(" ", "")


def main():
    digest = hashlib.sha256(WORKBOOK.read_bytes()).hexdigest()
    if digest != EXPECTED:
        raise ValueError("Workbook checksum changed.")
    rows = []
    with UNMATCHED.open(encoding="utf8") as f:
        for line in f:
            r = json.loads(line)
            if r[2] == "2025-26":
                rows.append(r)
    if len(rows) != 208 or len({tuple(r) for r in rows}) != 208:
        raise ValueError("Unexpected candidate rows.")
    if any(len(r) != 7 or r[3] != "Round 6" or not r[1] for r in rows):
        raise ValueError("Unexpected cutoff context.")
    url = dotenv_values(ROOT / ".env").get("ADMIN_DATABASE_URL")
    if not url:
        raise ValueError("ADMIN_DATABASE_URL is not configured.")
    with psycopg.connect(url, connect_timeout=15) as c:
        c.execute("SET LOCAL statement_timeout='90s'")
        c.execute(
            (ROOT / "supabase/migrations/0008_private_fyjc_cutoff_stage.sql").read_text(encoding="utf8")
        )
        c.execute(
            "CREATE TEMP TABLE cutoff_stage (LIKE cq_private_stage.fyjc_cutoff_observations INCLUDING DEFAULTS) ON COMMIT DROP"
        )
        with c.cursor().copy(
            "COPY cutoff_stage (row_hash,workbook_sha256,udise_code,choice_code,academic_year,round_name,seat_category,reservation,cutoff_value_raw) FROM STDIN"
        ) as cp:
            for row in rows:
                k = hashlib.sha256(
                    json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode()
                ).hexdigest()
                cp.write_row((k, digest, row[0] or None, *row[1:]))
        # Compare the source's full contextual key with live master rows. Existing
        # observations are skipped, even if no UDISE is present in the workbook.
        q = """INSERT INTO cq_private_stage.fyjc_cutoff_observations
       SELECT s.* FROM cutoff_stage s WHERE NOT EXISTS (
         SELECT 1 FROM cq_master_v11.institution_programs p
         JOIN cq_master_v11.admission_cutoffs a ON a.institution_program_id=p.id
         JOIN cq_master_v11.admission_cycles cy ON cy.cycle_id=a.cycle_id
         WHERE p.choice_code=s.choice_code AND cy.academic_year=s.academic_year
         AND cy.round_name=s.round_name AND lower(a.category)=lower(s.seat_category)
         AND COALESCE(NULLIF(lower(a.reservation_details),'unspecified'),'')=COALESCE(NULLIF(lower(s.reservation),'unspecified'),'')
         AND a.cutoff_value_raw=s.cutoff_value_raw
       ) ON CONFLICT (row_hash) DO NOTHING"""
        inserted = c.execute(q).rowcount
        total = c.execute(
            "SELECT count(*) FROM cq_private_stage.fyjc_cutoff_observations WHERE workbook_sha256=%s",
            (digest,),
        ).fetchone()[0]
        visibility = c.execute(
            "SELECT has_schema_privilege('cq_public','cq_private_stage','USAGE'),has_schema_privilege('cq_student','cq_private_stage','USAGE')"
        ).fetchone()
        if any(visibility):
            raise ValueError("Private stage is accessible to website roles.")
    print(
        f"New private cutoff rows: {inserted}; total staged from workbook: {total}; all have unverified scale."
    )


if __name__ == "__main__":
    main()
