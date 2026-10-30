# 05. Maharashtra Data: Scope, Sources, Import Format and Review

**Scope decision:** D-02, statewide breadth plus Pune and Nashik depth. **Enums:** `03` §6, §7. **Owner:** Anushka (scripts), B (manual downloads and spot checks).

## 1. Principles

1. Download first, parse offline, publish after review. Web requests never scrape.
2. Respect each portal's terms. No CAPTCHA bypass, no login scraping, no hammering. If a source only allows interactive lookup, do a small manual collection for the depth districts and record that in the register.
3. Never store personal rows (student names, application IDs) from merit lists. Only institution-level aggregates.
4. Raw government files do not go into Git (O-2). They go to a private Supabase bucket `raw-sources/` with a SHA-256 hash.
5. A finished script is not proof of completeness. Only the coverage report says what we have.

## 2. Source register (`data/sources.csv`, committed)

Starting points from v1. **Every row must be re-checked on Day 1**: URL alive, what it publishes for which year, file format, terms.

| source_id | Publisher | Starting URL | What we want | Layer |
|---|---|---|---|---|
| `src_fyjc_portal` | School Education Dept, FYJC CAP | https://mahafyjcadmissions.in/ | College list, streams, medium, round-wise cutoffs | Depth (Pune, Nashik), breadth if a list exists |
| `src_fyjc_cutoff` | same | https://mahafyjcadmissions.in/search/cutofflist-info | Cutoff by college, stream, round, category | Depth |
| `src_dte_poly` | DTE Maharashtra | https://poly26.dtemaharashtra.gov.in/ (check current-year subdomain) | Institute list, choice codes, branches, intake, CAP cutoffs | Breadth + depth |
| `src_dvet_iti` | DVET | https://www.dvet.gov.in/en/institute-directory/ | ITI institutes, trades, district | Breadth |
| `src_fra_fees` | Fee Regulating Authority | https://mahafra.org/ | Approved fees where applicable | Depth |
| `src_mahadbt` | MahaDBT | https://mahadbt.maharashtra.gov.in/ | Scheme list (P1) | P1 |
| `src_inst_<code>` | Individual institutions | from official records | Tuition notice, hostel, medium | Depth, spot fill |

Columns of `sources.csv`:
`source_id, publisher, url, document_title, academic_year, file_format, retrieved_at, sha256, terms_checked (yes/no/unclear), terms_note, collection_method (download/manual_copy/api), layer (breadth/depth), notes`

## 3. Import file formats (what the parsers output, and what the importer accepts)

Parsers are per source. They all write the **same canonical CSVs** into `data/staging/<run_id>/`. The importer only reads these. This lets B fill a CSV by hand from a PDF when a parser is not worth writing, and the rest of the pipeline is identical.

### `institutions.csv`
`ext_source_id, ext_institution_code, name_as_published, district, taluka, city, address, pincode, management_type, pathway_types, official_website, source_id, academic_year`

- `management_type`: `government`, `government_aided`, `private_unaided`, `unknown`
- `pathway_types`: pipe-separated route IDs from `03` §10

### `offerings.csv`
`ext_institution_code, program_code, program_name_as_published, pathway_id, stream (science/commerce/arts/blank), medium, intake, shift, hostel_status, source_id, academic_year`

- `hostel_status`: `available`, `not_available`, `unknown`

### `cutoffs.csv`
`ext_institution_code, program_code, admission_system, academic_year, round, category, quota, merit_metric, raw_value, numeric_value, extra_dimensions_json, source_id`

### `fees.csv`
`ext_institution_code, program_code, academic_year, kind, amount_inr, per (year/semester/one_time), applies_to_category (all or code), status (official_source/institution_source), source_id`

## 4. Pipeline stages

```
download (manual or script) → raw-sources bucket + sources.csv row
   → parse_<source>.py → data/staging/<run_id>/*.csv + parse_report.json
   → validate.py → validation_report.json (errors block, warnings go to review)
   → import.py --run <run_id> → staging tables in Postgres (idempotent)
   → review.py (CLI, P0) → approve / reject / merge with reason
   → publish.py --run <run_id> → published tables, publication_history row
   → coverage.py → data/coverage/district_coverage.csv + /data page
```

All scripts live in `data-ingestion/`, run locally or from a manual GitHub Actions workflow. Never from Vercel.

## 5. Validation rules (`validate.py`)

| Rule | Severity |
|---|---|
| Required columns present, types parse | error |
| `district` is one of the 36 official Maharashtra districts (list in `data/ref/districts.csv`) | error |
| `numeric_value` parse: `NA`, `-`, blank → null, never 0 | error if coerced |
| `0 ≤ numeric_value ≤ 100` when `merit_metric` is a percentage | error |
| Duplicate cutoff key (`03` §6) within a run | error |
| Fee `amount_inr` < 0 | error |
| Fee `amount_inr` = 0 without a note "officially free" | warning → review |
| Fee change > 30% vs last published year for the same offering | warning → review |
| Institution name matches an existing one in another district | warning → review (common names repeat) |
| Same `ext_institution_code` with a different name than published | warning → review |
| Cutoff for an offering we do not have | error (import the offering first) |
| Category or quota code not in `data/ref/codes_<system>.csv` | warning → review |

## 6. Identity resolution

- Canonical key: internal UUID. Match order: official code within the same admission system, then official code across systems via a manual map, then never by name alone.
- Name-only matches always go to review. Aliases are kept in `institution_aliases`.
- Merges are reversible (`publication_history` stores before and after).

## 7. Review (P0 is a CLI)

`python review.py --run <run_id>` prints each flagged row: source link, old value, new value, rule that fired. Actions: `a` approve, `r` reject, `m` merge into an existing institution, `s` skip. Each decision writes reviewer, time and reason to `verification_queue`. No LLM can approve anything. Admin web UI is P1 and reads the same table.

## 8. Coverage report

`data/coverage/district_coverage.csv`, one row per district (all 36):

`district, poly_institutes, poly_offerings, poly_cutoff_years, poly_fee_verified_pct, iti_institutes, fyjc_colleges, fyjc_cutoff_years, hostel_known_pct, last_refreshed, layer (breadth/depth), notes`

Blank means "we have no data", not "there are none". The `/data` page renders this table with a short honest note at the top: "Detailed data covers Pune and Nashik for 2025-26. Other districts show institute lists only."

## 9. Demo fixture (synthetic, separate from real data)

`data/fixtures/demo_student.json`:
- Board `SSC_MH`, result_type `official`, `is_synthetic: true`
- Subjects with Maths and Science stronger than languages, one subject the evaluator is prompted to correct
- Home city Nashik, target Pune, category volunteered `OPEN` (D-09), hostel preferred, tuition cap 30000
- No synthetic colleges. The demo student searches the **real** published data.

If on submission day the real depth data is not ready, a clearly marked `data/fixtures/demo_colleges.csv` may be loaded with `is_synthetic = true`, every card stamped "Demo data", and the README says so. This is a fallback, not the plan.

## 10. Day 1 to 3 data tasks (in order)

| # | Task | Owner | Done when |
|---|---|---|---|
| DATA-1 | Visit each source in §2, record what is actually available for 2025-26 and 2026-27, formats and terms in `sources.csv` | B | All rows filled, `terms_checked` not blank |
| DATA-2 | R-01 board aggregate research (`03` §4) | Anushka | Each question has a source link or is marked unverified |
| DATA-3 | Download DTE Polytechnic institute list (statewide) and Pune + Nashik cutoffs | B | Files in bucket, hashes in register |
| DATA-4 | `parse_dte_poly.py` to canonical CSVs | Anushka | Parse report shows row counts and rejects |
| DATA-5 | FYJC Pune + Nashik colleges and one year of round-wise cutoffs (script or manual CSV) | B + Anushka | Canonical CSVs validate with no errors |
| DATA-6 | DVET ITI directory (breadth) | Anushka | Institutes per district in coverage report |
| DATA-7 | Tuition for the Pune + Nashik Polytechnic offerings from FRA or official notices | B | Fee rows with `source_id`, unknowns left blank |
| DATA-8 | Import, review, publish, coverage | Anushka | `/data` page shows real counts |

## 11. Tests (`data-ingestion/tests/`)

`test_import_twice_no_duplicates`, `test_na_not_zero`, `test_bad_percentage_rejected`, `test_fee_jump_goes_to_review`, `test_same_name_other_district_goes_to_review`, `test_unknown_hostel_stays_unknown`, `test_publish_keeps_history`, `test_coverage_lists_all_36_districts`.
