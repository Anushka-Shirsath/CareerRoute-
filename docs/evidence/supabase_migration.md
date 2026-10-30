# Supabase migration — 29 October 2026

The active CareerQuest database is now the user's Supabase project `vyqudlabtavfiqqvkmzw`, reached through its Europe/Ireland Session pooler over TLS. The FastAPI and Next.js processes still run locally. The current temporary website URL is https://territories-studio-thick-por.trycloudflare.com.

## Data transferred

All 15 application tables were copied from a consistent SQLite cutover snapshot. There were **711,426 rows** at cutover:

| Table | Rows copied |
|---|---:|
| admission_cycles | 33 |
| domain_events | 50 |
| guest_sessions | 28 |
| import_runs | 2 |
| institutions | 14,882 |
| publication_history | 2 |
| rate_counters | 18 |
| report_shares | 4 |
| sources | 531 |
| student_sensitive_attributes | 28 |
| verification_queue | 3,564 |
| workspace_records | 353 |
| offerings | 58,430 |
| cutoffs | 633,501 |
| fees | 0 |

For every table, the script compared row counts and an order-independent sum of SHA-256 hashes of canonical **full rows**, including JSON and booleans. Every comparison passed before the transaction committed. Schema, role creation, copying, checksum verification and RLS validation were committed together. The measured database size was **279,500,467 bytes**, about 280 MB / 267 MiB, including the destination's existing platform data. Live workspace counts and size can change as the demo is used.

There were no existing public tables or CareerQuest roles in the destination. Nothing was dropped or overwritten. The 450 MB import safety ceiling stayed below the Free plan's published [500 MB database allowance](https://supabase.com/pricing); no paid upgrade was performed.

## Access and configuration

- All 15 tables enable and **force row-level security**.
- Supabase `anon` and `authenticated` have no application table SELECT/INSERT/UPDATE/DELETE privileges. The existing Data API setting does not change the application's access path.
- FastAPI's `DATABASE_URL` uses the generated `cq_api` login: **NOINHERIT, NOSUPERUSER, NOBYPASSRLS**. Administrator credentials remain separate and server-side.
- A fresh owner sees zero rows in each private table; the `cq_system` session/share resolver cannot read `workspace_records`.
- The active connection pool has at most three reused sessions. A real PostgreSQL regression test confirms that role and owner context disappear on commit and do not leak to the next owner on the same physical connection.
- The original session/report hash pepper was preserved, keeping existing browser tokens and report hashes usable. No login or Supabase Auth page was introduced.
- The root `.env` holds the active server configuration. `.env.example` contains no database credential. The user's Notepad `.env.txt` copy was merged and archived privately to prevent future edits going to the wrong file.
- PostgreSQL schema provisioning occurs through the migration, not application startup. SQLite retains its development setup behavior. Frontend workspace state now survives client-side navigation, avoiding repeated remote bootstrap queries.

Supabase's [connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres) documents the shared Session pooler and custom-role username format. No Supabase service-role or publishable API key is needed by this backend integration.

## Verification

- **118 backend tests passed** after moving disposable PostgreSQL test clusters to D: to avoid a full C: drive.
- The strengthened migration/pool regression tests passed again after enabling pooled session reuse.
- Ruff and frontend TypeScript checks passed. The production Next.js build passed.
- Local and public HTTPS health checks returned HTTP 200 and reported the database connected.
- **All six public browser flows passed using the actual hosted database.** The initial run passed the full Compass mission, live mentor transport and mobile sample PDF flow. After correcting synchronization/readiness assumptions, the three remaining checks passed together in 4.9 minutes: marks/shortlist/private note/costs/selected report/Marathi/revocation; district-gap explanation/statewide finder/offering detail; and the complete 16-route mobile sweep at 390×844 with no document overflow or serious/critical axe violations.

The first public browser run exposed test synchronization assumptions: revocation must be checked after the server acknowledges the mutation, and cold remote database loads need a longer readiness wait than SQLite. The revocation check now waits for the owner's visible `Revoked` acknowledgement before checking the public link. Readiness assertions allow remote database latency without skipping any functional assertions.

## Backup and operations

- The original `data/private/careerquest.db` remains intact.
- The cutover snapshot is `data/private/backups/careerquest-cutover-20261029T170907Z.db`.
- Private restricted credentials: `data/private/supabase-api.env`.
- Private receipt, table checksums, migration hashes and validation results: `data/private/supabase-migration.json`.
- Start API: `scripts/start.ps1`. Start website: `scripts/start-web.ps1` (or `-SkipBuild` to use the existing build).
- A new Cloudflare Quick Tunnel normally gets a new URL; update `PUBLIC_API_ORIGIN` and `ALLOWED_ORIGINS`, then restart the API. The current URL is already configured.
- New writes now go to Supabase. Do not switch back to the old SQLite snapshot without reconciling those new writes.

The temporary test directories from this run and the stopped, generated `validation-pg` cluster were preserved under `D:/CareerQuest-Test-Archives`, freeing space on C:. A broad temporary-directory deletion was rejected by automatic review; the safer archive operation preserved the generated files. Application databases, cutover backups and supplied source files were retained.

Fees/hostels, Polytechnic districts and verified cutoff metrics remain missing from the supplied sources. Migration preserves those gaps and inherited publication/review status. Full Marathi/Hindi working-screen translation, image OCR and durable application hosting remain outside this database migration.
