# Verification evidence — 29 October 2026

Local environment: Windows, Python 3.11.5. No production URL, GitHub CI run or live Groq evaluation is claimed.

The final full test run returned **113 passed**, including nine tests against real local PostgreSQL, with **89% measured application statement coverage**. Exact output is recorded in `test_results.txt`.

Commands:

```text
.venv/Scripts/python.exe -m pytest -q --cov=app --cov-report=term-missing
.venv/Scripts/python.exe -m ruff check services/api data-ingestion scripts
.venv/Scripts/python.exe scripts/export_openapi.py
pnpm generate:types
pnpm typecheck
.venv/Scripts/python.exe scripts/verify_full_dataset.py --postgres
.venv/Scripts/python.exe -m pip_audit -r services/api/requirements.lock.txt
```

Evidence artifacts:

- `full_dataset_validation.json`: real imported records exercised on SQLite and local PostgreSQL after the v7 reconciliation. PostgreSQL size measured 275,739,107 bytes (about 263 MiB); Supabase platform overhead is not included.
- `polytechnic_v7_reconciliation.json`: 449 institutes and 3,918 offerings reconciled by official codes, with no conflicting existing facts and no duplicates. Missing locations, fees, hostels and cutoffs remain unknown.
- `data_coverage.json` and `data/coverage/district_coverage.csv`: actual 36-district coverage and explicit unassigned-location counts.
- `dependency_audit.json`: pip-audit returned **No known vulnerabilities found** for the locked API dependencies. This is a known-advisory check, not a guarantee about all code.
- `test_results.txt`: final pytest output. The Starlette/httpx deprecation warning affects the test harness; requests and assertions still pass.
- `known_limitations.md`: source gaps, UI/deployment deferral, PDF layouts, translation review and provider evaluation status.

The local HTTP server was also checked through real HTTP requests: `/health` and `/docs` returned 200; the v7 course management field was present while approval remained null; anonymous session creation, a private profile read and workspace deletion passed. The API is served at `http://127.0.0.1:8000` in the current workspace session.

The Compass graph check exhausts all 3,125 S1–S5 combinations, tests contrasting interests, ignores mini-task correctness in route scores, and covers skips and early reports. API tests cover the backend journey, owner isolation, revision replacement, hard filters, cost unknowns, parent-report sections/revocation, signed upload checks, memory confirmation, persistent limits and deletion. PostgreSQL tests exercise actual RLS and a non-superuser application login rather than only mocking owner filters.

After the user configured `.env`, the server was restarted and one live Groq smoke test passed: a confirmed synthetic-result question called `get_my_academic_summary`, returned HTTP 200 and did not use fallback. The full 24-case live evaluation has **not run**. `scripts/evaluate_mentor.py` writes actual outcomes when executed. No 90% live-model pass is asserted.
