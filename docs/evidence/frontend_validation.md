# Frontend validation — 29 October 2026

Implemented in `apps/web` using Next.js, React, TypeScript, Lucide and self-hosted Instrument Sans. The root API remains FastAPI. No authentication pages or new paid services were added. The requested Leonxlnx/taste-skill was installed at `C:/Users/Lenovo/.codex/skills/taste-skill`; its app-screen workflow produced the Editorial greeting direction, seed 921081234. Design notes, screen questions and written critique are in `.taste-skill/`.

## Checks completed

- Next.js production build: passed, including framework TypeScript validation.
- Frontend and root contract TypeScript checks: passed.
- Backend pytest: **115 passed**, including PostgreSQL isolation and the two new frontend read-route tests.
- Ruff: passed for services/api, ingestion and scripts.
- OpenAPI regenerated: 45 API paths; TypeScript schema regenerated from it.
- Taste source lint: **0 FAIL**. Warnings are floating-overlay shadows and unknown-value dashes, explained in the critique.
- Taste production home inspection at 1440/768/390: **0 FAIL**, one retained warning about neutral draft data. All six listed screenshots were opened and reviewed.
- Taste production catalogue inspection at 1440/768/390 after the last filter fix: **0 FAIL, 0 WARN**. All six listed screenshots were opened and reviewed.

## Real-browser verification

Google Chrome, Playwright, installed local production server and real SQLite-backed API; synthetic sessions only.

The five-test complete browser run passed:
1. Explicitly confirm draft marks; save two published 2026–27 Polytechnic offerings; persist a private note; compare unknown fees without presenting a free program; save different hostel estimates; create a costs/next-steps report; read it in a new session in English and Marathi; verify private notes and academic sections are excluded; revoke the share and verify access fails. No browser JavaScript errors.
2. Answer all ten Compass moments, including the adaptive mini-task and enjoyment rating; receive and reload a persistent report.
3. See the missing-Polytechnic-district explanation, search statewide, and open a source-linked offering detail.
4. Submit a question through the mentor UI to the configured live backend and render its answer. This is a transport/UI check, not a claim of exhaustive model quality evaluation.
5. Visit 16 working routes at 390×844, verify one main heading, no document-wide overflow, and zero serious/critical WCAG 2 A/AA and 2.1 AA axe violations. Includes results, pathways, mission/report, directory/finder, shortlist/compare, mentor, reports, coverage, privacy and settings. This automated scan does not replace a manual assistive-technology audit.

A sixth focused browser test also passed at 360×740: use the folded mobile menu, upload the generated synthetic three-subject text PDF, verify extracted marks remain a draft and the confirm button remains disabled until reviewed. The academic snapshot stays absent.

The final public HTTPS Cloudflare tunnel passed two browser tests: the full result/shortlist/cost/report/revocation flow, and mobile PDF upload/review. This verifies same-origin proxying, cookies, origin checks, signed upload links and public report rendering through the actual tunnel.

## Running demonstration

- Local website: http://127.0.0.1:3000
- Backend: http://127.0.0.1:8000
- Temporary website URL: https://unfortunately-shark-retreat-unsigned.trycloudflare.com
- The website runs with `next start`, not the development server.
- The tunnel targets port 3000. The API permits that exact HTTPS origin and generates signed upload links for it. These values are process environment overrides; no credentials are exposed to Next.js.
- To restart locally, run `scripts/start.ps1` and `scripts/start-web.ps1` in separate terminals. Quick Tunnel links stop when their process or computer stops; a new tunnel usually gets a new URL.

## Limits retained honestly

The supplied source gaps are unchanged: no verified fees/hostels, no Polytechnic district fields, no ITI academic years or verified cutoff metric. Full offline work, image OCR, voice and additional missions are outside this build. Most app prose and mission text remain English; navigation and parent reports have English/Marathi/Hindi labels awaiting human language review. The PDF parser supports recognized text rows, not arbitrary scans. Browser sessions have no cross-device recovery.
