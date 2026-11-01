# Free services and the exact setup needed

Checked against the official pages on 29 October 2026. Stay on the free plans; no paid API, payment method, automatic upgrade or paid credit purchase is required for this implementation.

| Service | Used for | Free allowance / constraint | Setup needed |
|---|---|---|---|
| Local Python + SQLite | All backend features and AI fallback | No provider quota | Already installed and imported in this workspace |
| Groq Free | Optional live mentor | Published `openai/gpt-oss-120b` limits: 30 requests/minute, 1,000/day, 8,000 tokens/minute, 200,000/day; provider limits can vary by account | Create a free account and API key; set `GROQ_API_KEY` on the server |
| Supabase Free | Hosted PostgreSQL | 500 MB database, 5 GB egress, two active free projects; pauses after a week of inactivity | Create one project; apply schema/RLS; configure its restricted database connection |
| Vercel Hobby | Hosted API | Free personal/noncommercial projects; finite function/compute quotas | Import the repository with root `services/api`; set server environment variables |

Official references: [Groq limits](https://console.groq.com/docs/rate-limits), [Supabase pricing](https://supabase.com/pricing), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [FastAPI deployment](https://vercel.com/docs/frameworks/backend/fastapi), [function limits](https://vercel.com/docs/functions/limitations).

## Account sign-in

Sign-in is off unless `AUTH_ENABLED=true`. While it is off, `/login` shows the home page and the account section in Settings is hidden, so the feature is invisible. When it is on, students can sign up, sign in, reset a forgotten password, change their password and sign out of every device from `/login` and Settings → Privacy. To turn it on, set `AUTH_ENABLED=true`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the server `.env`, then run `python scripts/setup_account_sessions.py` with the existing `ADMIN_DATABASE_URL`. This adds a server-only session table and verifies its RLS. Never use the Supabase secret or service-role key in the browser or application configuration.

Enable email/password sign-in and email confirmation in Supabase. In Authentication → URL Configuration, add the current public website URL followed by `/login` to the allowed redirect URLs. Quick Tunnel URLs change when restarted, so update this setting when the link changes. The built-in Supabase mail service sends only to project organization members and is limited to two messages per hour. Configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) to send confirmation to other addresses; use a free provider within its published limits. Confirm email must remain enabled for verified accounts.

Guests and signed-in accounts have separate workspaces; sign-in does not copy a guest's data. Workspace deletion removes the application data and its account sessions but does not delete the Supabase Auth identity. Account sessions expire 30 days after sign-in, or after 14 days without use, and are revoked on sign-out. Resetting or changing the password in the app signs out every other session; a password changed directly in Supabase does not. Account deletion UI is not yet provided.

The application also caps anonymous mentor use at 15 turns/day, matching at 60/hour, uploads at 10/day, and active report shares at five. Tool loops can consume several provider requests per turn. These app caps do not guarantee that every provider quota is sufficient under concurrent load; fallback remains available.

## 1. Enable the optional mentor

Create a key in the [Groq console](https://console.groq.com/keys). Copy `.env.example` to `.env` and put the key in `GROQ_API_KEY`. Leave `GROQ_CHAT_MODEL=openai/gpt-oss-120b`, or choose another currently supported tool-capable model in your account. Restart the API.

**Do not paste API keys, database passwords or service secrets into chat.** Keep them in `.env` locally and Vercel's server-side environment settings when hosted. No `NEXT_PUBLIC_` secret is used.

Run `python scripts/evaluate_mentor.py` after configuring the key. It writes the actual 24-case results; aim for at least 90% overall and every `must_refuse` / `must_not_invent` case passing. Treat automated checks as a minimum, with human review of grounding and translations. No live result has been fabricated in this workspace.

## 2. Create the hosted database

Create one Free Supabase project. Keep its administrator connection for one-time setup/import **on your computer only**. Save its Session pooler URI (port 5432, `sslmode=require`) as `ADMIN_DATABASE_URL` in the root `.env`. Use the database password chosen in Supabase; URI-encode special password characters. The file must be named `.env`, not `.env.txt` or `.env.example`.

For migration of the existing local database, stop the API first so there are no writes during cutover, then run:

```powershell
.\.venv\Scripts\python.exe scripts/migrate_to_supabase.py
.\.venv\Scripts\python.exe scripts/migrate_to_supabase.py --apply
```

The first command prints an inventory. `--apply` creates a consistent local SQLite backup and imports all 15 application tables into an empty project. It preserves the catalogue, verification status, demo workspaces, session hashes and report shares. Schema creation, row copying, full-row checksum/count verification and RLS enforcement happen in one transaction. Existing public tables or CareerQuest roles cause a safe refusal; nothing is dropped or overwritten. A 450 MB safety ceiling leaves room within the Free allowance. No paid upgrade is performed.

The script generates a distinct restricted `cq_api` login with `NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS`, verifies owner isolation through that login, and saves its URI in `data/private/supabase-api.env`. This private file also preserves the existing `SHARE_TOKEN_PEPPER`, so browser sessions and report token hashes remain valid. A receipt with per-table counts/checksums is saved in `data/private/supabase-migration.json`. The later account-session migration is a separate additive step described above.

Only after those checks pass, copy `DATABASE_URL` and `SHARE_TOKEN_PEPPER` from that private candidate file into the root `.env` and restart the API. Keep administrator credentials separate from the active application connection. Verify `/health` and the browser workflows after restart; keep the local SQLite backup for rollback. Do not restart against SQLite once new hosted writes have begun without reconciling those writes.

For a new empty database without local workspace state, the older `setup_postgres.py` helper remains available with `ADMIN_DATABASE_URL` and a 24+ character `CQ_API_PASSWORD`; the offline catalogue import can then run as administrator:

```powershell
.\.venv\Scripts\python.exe data-ingestion/pipeline.py migrate-supplied
```

The API's `DATABASE_URL` must use **cq_api**, not the administrator. The shared session pooler uses `cq_api.PROJECT_REF`. Keep `sslmode=require`; the migration helper formats the generated API password safely. No Supabase publishable/service-role key is needed for this direct PostgreSQL integration. Browser Data API roles have no table privileges; all student access goes through the existing FastAPI owner checks and PostgreSQL RLS.

The local PostgreSQL dataset measured about 263 MiB after the supplementary extract reconciliation. Check Supabase's actual project usage after import; its platform tables and future uploads add overhead. Do not upgrade automatically if a quota is reached.

## 3. Deploy the API

A Vercel Function cannot run the required isolated Docker scanner, so Vercel is
only supported for the synthetic-data demo with uploads switched off
(`SCANNER_BACKEND=disabled`); follow [Hosting the demo on Vercel](VERCEL_DEPLOYMENT.md).
For real students, use a host with a controlled Docker runtime, or implement and
independently verify an isolated scanner service before deploying to a
serverless platform. Configure:

```dotenv
ENVIRONMENT=production
DATABASE_URL=<restricted cq_api pooler URI with sslmode=require>
COOKIE_SECURE=true
SHARE_TOKEN_PEPPER=<random secret of at least 32 characters>
PUBLIC_API_ORIGIN=https://YOUR-API.example
ALLOWED_ORIGINS=https://YOUR-FUTURE-WEBSITE.example
DEMO_MODE=true
MENTOR_ENABLED=true
GROQ_API_KEY=<optional server key>
GROQ_CHAT_MODEL=openai/gpt-oss-120b
MAX_UPLOAD_BYTES=4194304
SCANNER_BACKEND=docker
```

Keep the API and future website on the same site, preferably through an `/api/v1` reverse proxy. Anonymous cookies are intentionally `SameSite=Strict`; independent unrelated website/API domains are not a supported cookie deployment. If using a proxy, set `PUBLIC_API_ORIGIN` to the browser-visible same-origin host.

New PDF and image contents are processed during upload without saving the original file in the application database. Never enable unrestricted request-URL access logs: upload and share URLs carry bearer tokens. The supplied startup command disables Uvicorn access logs; the application emits redacted route templates.

Run `/health`, the backend demo through `/docs`, and actual mentor evaluation after deployment. A configured deployment file is not evidence of a live deployment.

## 4. Retention and CI

Run `python scripts/cleanup.py` daily from your own computer or a free scheduled CI job, using a protected administrator database connection. It deletes expired anonymous workspaces, clears expired upload contents, and removes old quota buckets. Without this job, extraction still deletes raw contents immediately; untouched expired uploads remain stored until cleanup runs. Never expose cleanup as a public endpoint.

The backend CI runs tests, real PostgreSQL policies, lint, type generation/checking, dependency audit and secret scanning. The manual mentor workflow needs `GROQ_API_KEY`, `EVAL_DATABASE_URL` (restricted role on the seeded database), and `EVAL_SHARE_TOKEN_PEPPER` repository secrets. It fails clearly if they are absent.
