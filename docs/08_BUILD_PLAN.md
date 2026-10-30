# 08. Build Plan for Two People and Their Agents

**Assumes:** D-11 ownership, D-12 ten working days. Adjust dates once the real deadline is known.

## 1. How we work

1. **Contracts before code.** Day 1 ends with the OpenAPI skeleton, the SQL migrations and the TS client generated. After that, each side can build against the contract with mocks.
2. **One owner per work package.** The other person reviews. Agents work inside one package at a time.
3. **Every PR carries evidence** (template §5). "Agent says it works" is not evidence; test output is.
4. **Daily 15-minute sync** (or async note): what passed, what is blocked, which decision needs changing.
5. **The demo script in `01` §6 is the north star.** From Day 6 onward, run it on the deployed preview every evening.

## 2. Day-by-day plan

| Day | B (web, UX, data collection) | Anushka (API, AI, data scripts) | End-of-day proof |
|---|---|---|---|
| 1 | Repo + Next.js shell + i18n setup + Vercel web project. DATA-1 source check. | FastAPI skeleton on Vercel, JWT verify, `/me/profile`. Migrations 0001 + 0002. Groq model check (D-04). R-01 started. | Both deploys live; anonymous sign-in works; RLS test "user A cannot read B" green |
| 2 | Generated API client. Marks entry form for 3 boards + review screen (against mocks). DATA-3 downloads. | `/results/*` (manual, confirm), subject catalogue, snapshot. PDF text spike (D-05). R-01 done or marked unverified. | Manual marks → confirm → snapshot works end to end |
| 3 | Snapshot screen. Compass mission player reading YAML (S1 to S6, MT, V1). | Compass sessions/events/report + all `04` §7 tests. DATA-4 DTE parser. | Two contrasting playthroughs give different reports |
| 4 | Compass report screen, override, `/me/goal`. Mission text in `mr` and `hi` for key screens. | `validate/import/review/publish` + DATA-5 FYJC for Pune and Nashik. | Real Pune + Nashik records published with sources; import twice = no duplicates |
| 5 | Finder screen with filters, groups (main / hostel unknown / fee unknown), "Why this?" drawer. DATA-7 fees. | `/match` with three axes, ranker v1, `/offerings/{id}`, `/colleges`. Matching unit tests. | Changing a weight changes order; wrong-quota cutoff shows `not_comparable` |
| 6 | Shortlist, compare, cost split UI. `/data` page. | `/costs/compare`, shortlist API, dashboard API, coverage endpoint. DATA-6 ITI breadth. | **First full run of the demo script on preview** (mentor can be stubbed) |
| 7 | Mentor chat UI, fallback UI, memory page. Dashboard. | Groq adapter, tools, prompt, post-check, memory. Eval cases 1 to 12. | Mentor answers case #2 with real facts; case #10 refused |
| 8 | Parent report builder, preview, share page `/r/[token]`, WhatsApp share, print CSS, locale toggle. | `/parent-reports`, share token, revoke. Eval 13 to 24. `/session/demo` fixture cloning. | Shared link shows only ticked sections; revoked link fails |
| 9 | Playwright E2E for the whole demo script; mobile 360px pass; accessibility pass; admission guides. | Full test suite in CI; mentor eval report; security tests (`09` §3). Rate limits. | CI green on main; eval ≥ 90% |
| 10 | README, architecture diagram, screenshots for README, `/privacy` page. | OpenAPI docs page, `docs/evidence/*`, known-limitations section. | Demo script passes on the production URL with and without Groq key |

Buffer: none is built in. That is why the cut order (§6) exists.

## 3. Work packages (for agents)

| WP | Scope | Depends on | Owner | Acceptance (all must pass) |
|---|---|---|---|---|
| WP-01 Foundation | Monorepo, two Vercel projects, rewrites, Supabase, migrations, RLS, anonymous auth, CI skeleton | none | both | Deploys live; `test_rls_isolation` green; no secrets in repo (gitleaks) |
| WP-02 Results | Manual + PDF text extract, review, confirm, revisions, snapshot | WP-01 | Anushka API, B UI | `09` §2 results tests; Playwright `results.spec` |
| WP-03 Compass | Mission YAML, player, sessions, scoring, report, override | WP-01 | B content/UI, Anushka scoring | `04` §7 tests; Playwright `compass.spec` |
| WP-04 Data | Source register, parsers, validate, import, review CLI, publish, coverage | WP-01 | Anushka, B | `05` §11 tests; real records visible |
| WP-05 Matching + costs | `/match`, ranker v1, offerings, costs, shortlist, compare | WP-02, WP-04 | Anushka API, B UI | `09` §2 matching and cost tests; Playwright `finder.spec` |
| WP-06 Mentor | Adapter, tools, prompt, post-check, memory, fallback | WP-05 | Anushka API, B UI | Eval ≥ 90%, groups `must_refuse` and `must_not_invent` 100% |
| WP-07 Dashboard + guide + parent report | Dashboard, guides, report builder, share, revoke | WP-03, WP-05 | B UI, Anushka API | Playwright `parent_report.spec`; `test_share_excludes_unticked_sections` |
| WP-08 Ship | E2E, a11y, PWA, docs, evidence | all | both | Demo script passes on prod URL; README complete |

## 4. Agent work order (paste at the top of every agent session)

```
You are implementing <WP-ID> of CareerQuest Maharashtra.
Read first: docs/03_DOMAIN_RULES.md (binding), docs/02_DECISIONS.md, and <the WP's spec files>.
Scope: only files under <paths>. Do not edit other packages, migrations or contracts without saying so.
Rules:
- Use enum strings exactly as in 03. Do not invent new states.
- Never fabricate institutions, fees, cutoffs, dates or model capabilities.
- Unknown values stay null/unknown. Never 0.
- Every student data query goes through the authenticated user; never accept a student id from input.
- Write tests first for domain functions in app/domain/. Run them and paste real output.
- If a decision is missing or a spec conflicts, stop and list the question. Do not guess.
Done means: acceptance tests in docs/08 §3 for <WP-ID> pass locally and in CI, and you return the evidence block.
```

## 5. PR evidence block (required in every PR description)

```
WP: WP-05
What changed: <3 to 6 bullets>
Contract changes: none | <endpoint/schema diff>
Migrations: none | 0004_xxx.sql
New env vars: none | <names>
Tests run: <exact commands>
Result: <paste summary lines, e.g. "48 passed, 0 failed">
Demo script steps now working: <numbers>
Trust rules touched: <T-xx list> and how they are tested
Known gaps: <list>
```

## 6. Cut order if time runs short

Cut in this order, top first. Never cut anything in the "never cut" row.

1. Marathi/Hindi beyond the parent report and trust labels
2. PDF upload (keep manual entry)
3. Cost compare (keep single-offering cost split on the detail page)
4. Mentor memory suggestions (keep confirmed facts and preferences)
5. ITI breadth layer
6. WhatsApp share button (keep link + print)
7. Compass mini-task (keep choices, R1, S6, V1)

**Never cut:** source + year on facts, unknown ≠ zero, confirm-before-use, RLS isolation, three separate match axes, no chance numbers, mentor fallback, the demo script passing.

## 7. Definition of done for the submission

- [ ] Production URL passes the demo script on a 360px viewport, with and without `GROQ_API_KEY`
- [ ] CI green: web typecheck + lint, API lint + unit, RLS isolation, data ingestion, Playwright E2E
- [ ] Mentor eval report committed and ≥ target
- [ ] `/data` shows real coverage; README states exactly what is real, what is demo, what is missing
- [ ] README: what it is, live link, how to try (demo button), architecture diagram, local setup, test commands, decisions summary, limitations, roadmap
- [ ] OpenAPI docs reachable
- [ ] No raw government files, real marksheets, or secrets in Git
- [ ] No PPT, no video
