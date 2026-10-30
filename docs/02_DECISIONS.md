# 02. Decision Log (v2)

**Current implementation:** The user's request defers UI and login/account pages. Backend implementation overrides and their reasons are recorded in `implementation/DECISIONS.md`; the original proposals below remain as planning history.

**Status key:** `LOCKED` = confirmed in the v1 discovery interview. `PROPOSED` = new default in v2; B and Anushka confirm or change it before Day 1, then mark it LOCKED. Agents treat PROPOSED as binding unless told otherwise.

## Locked from v1 (kept as is)

- Class 10 students only; boards SSC, CBSE, ICSE.
- Result-first onboarding: manual, upload, or provisional marks; nothing used until confirmed.
- One optional hybrid career game, short first session, deeper missions optional.
- Pathways: FYJC Science, Commerce, Arts; Polytechnic; ITI; recognised vocational.
- Matching = hard eligibility first, then adjustable preference ranking. Example weights academic 85, affordability 75, proximity 50 are importance values, not probabilities.
- Persistent, reviewable, deletable mentor memory. English, Marathi, Hindi.
- Parent report with student-controlled sections.
- No auto-submission to government portals.
- Mobile-first PWA. Next.js + TypeScript, FastAPI, Supabase (Postgres, Auth, Storage), Groq, Vercel. ₹0 hosting target, not a guarantee.
- Vertical slice first. No PPT, no demo video.

## Decisions that v1 left open

### D-01 Accounts and guest mode (was Q37), PROPOSED
- **"Try as demo student"** uses Supabase anonymous sign-in. On first load the API clones the synthetic fixture student into that anonymous user. Every evaluator gets a private sandbox; no shared demo password is ever published.
- **Real accounts:** email magic link. An anonymous user can upgrade to a real account and keep their data.
- **Uploads are allowed for anonymous users** but stored privately and auto-deleted after 24 hours.
- Public pages without sign-in: landing, `/explore` (pathway info), `/colleges` directory (no personal matching), `/data`, `/privacy`.
- Anonymous users are rate-limited harder on the mentor (see `06` §8).

### D-02 Data scope (was Q27), PROPOSED
**Statewide breadth, two-district depth.**
- Breadth layer: every Polytechnic and ITI institute in Maharashtra we can get from an official directory (name, code, district, management type, source). FYJC breadth if the portal offers a reusable list.
- Depth layer: Pune and Nashik districts, one academic year of published data (programs, medium, intake, category/round cutoffs, tuition where an official notice exists), for Polytechnic and FYJC.
- The `/data` page shows exactly this, district by district. "Statewide" is claimed only for the breadth layer.

### D-03 Backend topology, PROPOSED
- Monorepo, **two Vercel projects**: `apps/web` (Next.js) and `services/api` (FastAPI, Vercel zero-config FastAPI).
- Next.js `rewrites` map `/api/v1/*` to the FastAPI deployment, so the browser sees one origin and CORS stays simple.
- Browser sends the Supabase access token as `Authorization: Bearer`. FastAPI verifies it against Supabase JWKS. No separate BFF layer (v1 had BFF + FastAPI, which is one hop too many).
- FastAPI talks to Postgres with a role that respects RLS for student data (`SET request.jwt.claims` per request, or the user's token via PostgREST). Service role is used only by the importer and admin CLI.
- Reason to keep Python: Anushka's strength, the ingestion and scoring code is naturally Python, and it shows a typed contract between two runtimes.
- Fallback if Vercel Python limits bite: same container on another free host, contract unchanged.

### D-04 Mentor responses, PROPOSED
- P0 is non-streaming with a typing indicator. Streaming is P1 after confirming it works through the rewrite on the deployed setup.
- Models are configured by env var, never hard-coded: `GROQ_CHAT_MODEL` (default `openai/gpt-oss-120b`), `GROQ_FAST_MODEL` (default `llama-3.1-8b-instant`, used for cheap tasks like query classification). Re-check the Groq models page on Day 1.

### D-05 OCR strategy, PROPOSED
1. **P0:** manual entry (always available) and **PDF text-layer extraction** with `pdfplumber`. Many results downloaded from DigiLocker or board sites are text PDFs, which parse far more reliably than photos. Day 1 spike: test 2 real sample PDFs per board (with personal details removed) and record which have a text layer.
2. **P1:** image OCR through a `VisionExtractor` adapter. Default provider is whatever Groq vision model exists that day (currently only the preview `qwen/qwen3.8-27b`). Kill switch: `OCR_IMAGE_ENABLED=false` hides the photo option.
3. Extraction output always goes to the review screen. Never auto-confirmed.

### D-06 Mascot (was Q36), PROPOSED
- P0: a simple 2D SVG character with CSS state classes (`idle`, `thinking`, `happy`, `error`). No lip sync.
- P1: Rive or Lottie animation with the 7 states from v1.
- Respect `prefers-reduced-motion`. Never covers a cost or eligibility caveat.

### D-07 Languages, PROPOSED
- All UI strings go through i18n keys from Day 1 (`en`, `mr`, `hi` files).
- P0: English UI complete; Marathi and Hindi for the landing page, navigation, all trust labels, the parent report and mentor replies. Missing strings fall back to English with no crash.
- Course and admission terms use a fixed glossary (FYJC, CAP, quota, round, merit) and are not machine-translated on the fly.

### D-08 Name of the report, PROPOSED
"Career DNA" becomes **"Career Compass"**. "DNA" implies something innate and fixed, which contradicts our own rule that results are exploratory and can change. Code identifiers use `compass`.

### D-09 Category / reservation data, PROPOSED
- Asked only inside the college finder, only when the student wants cutoff comparison, with a one-line reason ("Published cutoffs differ by category").
- Options include "Prefer not to say". If skipped, comparison status is `no_cutoff_record` or `not_comparable` with reason `CATEGORY_NOT_PROVIDED`.
- Stored in `student_sensitive_attributes` (owner-only RLS). Never sent to Groq, never in a parent report unless the student ticks it, never inferred from name or marksheet.
- The demo fixture student has volunteered `OPEN` so the evaluator can see a `comparable` result.

### D-10 Board aggregate rules, PROPOSED
- We do not guess board aggregate formulas. Day 1 research task R-01 (see `03` §4) finds the official rule each admission system uses.
- Until a rule is sourced, the app shows "Average of entered subjects" labelled as such, and cutoff comparison for that board is `not_comparable` with reason `AGGREGATE_RULE_UNVERIFIED`.

### D-11 Team ownership, PROPOSED
| Area | Owner | Reviewer |
|---|---|---|
| Next.js app, routing, state, PWA, i18n, parent report page, Playwright E2E, Vercel web deploy | B | Anushka |
| UI/UX design system and screens | B (separate track) | Anushka |
| FastAPI services: results, compass scoring, matching, costs, reports API | Anushka | B |
| Groq adapter, mentor tools, memory, mentor eval | Anushka | B |
| Data ingestion scripts, source register, coverage report | Anushka (scripts) + B (manual downloads and checks) | both |
| Supabase schema, RLS, RLS tests | Anushka | B |
| OpenAPI contract and generated TS types | both, contract PRs need both approvals | |
| Game content (Mission 1 text and translations) | B | Anushka |

### D-12 Timeline, PROPOSED
No deadline was given. Plan assumes **10 working days** to a submittable P0 (see `08`). If the real deadline is shorter, follow the cut order in `08` §6.

## Still open (non-blocking)

| ID | Question | Safe default until answered |
|---|---|---|
| O-1 | Real Spektra deadline and any rubric | D-12 |
| O-2 | Can official cutoff PDFs and directories be redistributed in our repo? | Do not commit raw government files to Git; store them in a private Supabase bucket and link to the official URL |
| O-3 | Parental consent flow for real users (DPDP) | Synthetic data only; banner "Demo build, do not upload real marksheets" on upload screens |
| O-4 | Living-cost assumptions per city | Student-entered values with suggested defaults clearly labelled "your estimate" |

## Change control

Any change to a LOCKED or PROPOSED decision: edit this file in the same PR as the code change, with a one-line reason. Agents do not change decisions; they stop and ask.
