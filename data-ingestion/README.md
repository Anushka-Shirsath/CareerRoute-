# Offline ingestion

HTTP requests never scrape official portals or run an import. Run these tools locally with administrator database credentials; the deployed restricted API role cannot publish catalogue changes.

## Supplied SQL archive

```powershell
.\.venv\Scripts\python.exe data-ingestion/pipeline.py stage --file careerquest_dump.sql.zip
.\.venv\Scripts\python.exe data-ingestion/pipeline.py migrate-supplied
```

`stage` validates the COPY framing and parses escaped tab-separated values into a private SQLite staging database. It never executes dump DDL, statements, functions or triggers. The zip is read without extracting its paths. The archive hash identifies the import and repeated migration is idempotent.

`migrate-supplied` preserves existing reviewed/unresolved states rather than approving new source facts. Pending records remain staged. Unknown fields remain null. Full raw tables—including scholarship and seat-matrix data outside the P0 API—are retained only in ignored local staging. The normalized application database contains the P0 catalogue and provenance links.

## New reviewed facts

1. Obtain files or details from an official portal or institution source without bypassing access controls. Keep raw documents outside Git.
2. Register metadata with `python scripts/register_sources.py PATH_TO_SOURCES.csv`. Required columns are `source_id,publisher,url,academic_year,terms_checked`; optional columns include `sha256,retrieved_at,document_title,terms_note`. This only registers provenance, not approval of facts.
3. Prepare a run folder with the canonical CSVs described in `docs/05_DATA_PIPELINE.md`. Empty files are optional; supplied files must have their required headers. Use one admission system per run, unique program codes per medium/shift, and explicit academic years.
4. Validate and stage:

```powershell
python data-ingestion/canonical.py validate --folder data/staging/MY_RUN
python data-ingestion/canonical.py stage --folder data/staging/MY_RUN
```

The second command returns a run ID. Validation errors block publication; warnings require review. NA/blank cutoffs remain null; bad percentages, missing relationships and negative fees fail. Fee jumps, duplicate names across districts, renamed official codes, unfamiliar quota/category/metric codes and unsupported zero fees are flagged. An unknown hostel remains `unknown`.

5. A human reviews the source and warnings, then records a reason:

```powershell
python data-ingestion/canonical.py review --run RUN_ID --reviewer YOUR_NAME --reason "Compared all rows to official publication" --decision approve
python data-ingestion/canonical.py publish --run RUN_ID
```

Use `--decision reject` to withhold the run. Agents must not invent a human reviewer or silently approve new factual records. Publication is transactional and retains before/after history. Existing official code/system mappings identify institutions; a matching name alone never merges them. Do not automatically equate `GENERAL` and `OPEN`, infer quota from reservation prose, infer district from a name, or infer an academic year from a retrieval date.

6. To undo an unchanged canonical publication:

```powershell
python data-ingestion/canonical.py revert --run RUN_ID
```

Reversion refuses to overwrite later changes. The original supplied-data migration can instead be reproduced from the zip into a new database; it is not a destructive rollback command.

`python scripts/verify_full_dataset.py` refreshes the coverage CSV and checks the real imported data. Add `--postgres` with the optional dev dependencies installed to measure the same dataset in local PostgreSQL. Counts are evidence of what was imported, not a claim of completeness across Maharashtra.

## Additional Polytechnic extract

The user supplied `polytechnic_extract_v7_20261029.zip`. It was reconciled by institute code and choice code: all 449 institutions and 3,918 course rows match the existing facts. The extract explicitly confirms that districts, fees, hostels and public institute-level cutoffs are unavailable in the checked feeds. It clarifies that `course_management_type` is the feed's course status, **not approval status**. The API records this distinction and retains null approval status.

To reproduce the identity-preserving reconciliation:

```powershell
python data-ingestion/reconcile_polytechnic.py PATH_TO_polytechnic_extract_v7_20261029.zip
python data-ingestion/reconcile_polytechnic.py PATH_TO_polytechnic_extract_v7_20261029.zip --apply
```

The first command is a dry run. New identities or changed existing facts are refused and must use canonical review. Source URLs and supplied-file hashes are preserved, with no claim of a fresh download. See `docs/evidence/polytechnic_v7_reconciliation.json`. Further authoritative district/fee/hostel/metric data can use the canonical pipeline whenever available; unknowns remain visible until then.
