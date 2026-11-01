# Hosting the demo on Vercel

This puts the synthetic-data demo on the public internet using two Vercel projects from this one repository. It is **not** a real-student launch; see [real-student readiness](REAL_STUDENT_READINESS.md).

| Project | Root directory | What it is |
|---|---|---|
| `careerquest-web` | `apps/web` | The Next.js website. It forwards `/api/v1/*` to the API, so the browser only ever talks to one address and cookies stay on it. |
| `careerquest-api` | `services/api` | The FastAPI backend, as one Vercel Function (`index.py`). |

The project names set the web addresses (`careerquest-web.vercel.app`). If a name is taken, add a suffix and use that address below.

## What is different on Vercel

- **Marksheet upload is switched off.** Reading a marksheet needs the isolated Docker scanner, and Vercel Functions cannot run Docker. With `SCANNER_BACKEND=disabled` the upload tab is hidden and students type their marks by hand. The setting is refused unless `DEMO_MODE=true`, so it cannot be used for real students by accident.
- **The database must be Supabase.** The local SQLite catalogue is not available there. Use `EVIDENCE_BACKEND=postgres` and `MASTER_ENABLED=true`.
- **Use Supabase's transaction pooler (port 6543)**, not the session pooler (5432). Each serverless instance opens its own connections, and the session pooler runs out of them quickly. The API already avoids keeping a pool when it runs on Vercel.
- **The mentor can run for at most 60 seconds** (`maxDuration` in `services/api/vercel.json`). If the AI provider asks the mentor to wait longer, the reply fails instead of returning the fallback. Raise it only after checking your plan's limit.
- **The daily cleanup job does not run here.** Expired guest workspaces stay in the database until `python scripts/cleanup.py` is run from your computer or a scheduled CI job.

## Steps

Do these in order, because each project needs the other's address.

1. **Create the API project.** In Vercel choose Add New, Project, import this repository, and set Root Directory to `services/api`. Framework is detected as FastAPI. Before the first deploy, add the environment variables below.
2. **Create the web project.** Import the same repository again with Root Directory `apps/web`. Add `API_ORIGIN` (below) and deploy. If it is missing or not an `https://` address, the build stops with a message saying so, so the site can never be deployed pointing at localhost.
3. **Set the API's two origin variables** to the web project's address, then redeploy the API.
4. **Check it.** Open `https://<web>/api-health`. It should say the database is connected. Then open the site, confirm the sample marks load, and ask the mentor one question.

## API environment variables

Set these in the API project. Never paste secrets into chat or commit them.

| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | The restricted `cq_api` login on the **transaction pooler** (port 6543), with `sslmode=require` |
| `COOKIE_SECURE` | `true` |
| `SHARE_TOKEN_PEPPER` | At least 32 random characters. To keep existing guest sessions and parent-report links working, use the same value as your local `.env`; a new value signs everyone out and breaks old links |
| `PUBLIC_API_ORIGIN` | The **website's** address, for example `https://careerquest-web.vercel.app`. Parent-report links and email links are built from it |
| `ALLOWED_ORIGINS` | The same website address |
| `DEMO_MODE` | `true` |
| `SCANNER_BACKEND` | `disabled` |
| `EVIDENCE_BACKEND` | `postgres` |
| `MASTER_ENABLED` | `true` |
| `MENTOR_ENABLED` | `true`, or `false` to run without the AI mentor |
| `GROQ_API_KEY` | Your Groq key (optional) |
| `GROQ_CHAT_MODEL` | `openai/gpt-oss-120b` |
| `AUTH_ENABLED` | `true` to turn on account sign-in, with `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Leave unset to keep it off. See the account sign-in notes in [services and setup](SERVICES_AND_SETUP.md) first |

## Web environment variable

| Variable | Value |
|---|---|
| `API_ORIGIN` | The API project's address, for example `https://careerquest-api.vercel.app`, with no path and no trailing slash |

Changing `API_ORIGIN` needs a redeploy of the web project, because the forwarding rule is fixed when it is built.

## If something looks wrong

- **The site loads but data never appears.** Open `/api-health`. If it fails, check `DATABASE_URL` and that the API deployment finished.
- **The API answers with a Vercel sign-in page.** Deployment Protection is on for the API project. Check its setting under Settings, Deployment Protection.
- **403 "Origin is not allowed" when saving.** `ALLOWED_ORIGINS` does not match the website address exactly (scheme and host, no trailing slash).
- **Signed out on every page.** `COOKIE_SECURE` must be `true` and the site must be opened over `https://`.
