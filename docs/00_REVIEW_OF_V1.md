# 00. Review of Planning Pack v1.1 and What Changed in v2

**Audience:** B and Anushka. Read this once, then work from files 01 to 09.

## The short verdict

v1.1 is careful and honest. Its trust rules (no fake fees, no "92% chance", unknown is not false, OCR must be confirmed, AI only reads through tools) are the best part and v2 keeps all of them.

Its problems are the ones that hurt a two-person team handing work to coding agents:

1. **Too big for an assignment.** 20 modules, 18 documents, about 21,000 words. P0 alone has 9 bullet groups covering OCR for three boards, an adaptive game, a tool-calling mentor, an admin import pipeline, cost comparison, a parent report, an admission copilot, a Career Mission and a three-language PWA. An agent given all of that builds a wide, shallow app.
2. **The same rule is written many times, in slightly different words.** "Unknown fee is never ₹0" appears in at least 8 places. When rules are repeated, they drift, and they already have (see the table below). An agent cannot tell which version wins.
3. **The enums and names do not match across files.** This is the most serious technical issue because agents will generate code straight from these names.
4. **Too many "should", "where feasible", "verify before claiming".** Good caution, but an agent needs a decision plus a kill switch, not an open question.
5. **The hard parts are described, not specified.** The evidence-to-pathway scoring, the board aggregate rules, the import file format, the mentor system prompt, the tool schemas and the demo dataset are all left for the agent to invent. Those are exactly the parts where an invented answer is dangerous.
6. **No team plan.** The pack defines nine "agents" but there are two people. Nothing says who owns what, or how long anything should take.
7. **Several open decisions block the very first commit** (guest mode Q37, data scope Q27, stack topology).

## Contradictions found in v1.1

| Concept | v1.1 file and wording | v1.1 other file and wording | v2 canonical (in `03_DOMAIN_RULES.md`) |
|---|---|---|---|
| Eligibility states | 02: confirmed / needs-more-info / not-eligible. 15: `eligible`, `needs_more_information`, `not_eligible` | 16: `eligible_by_known_rules`, `not_eligible`, `needs_more_information`, `rules_not_verified` | `eligible_by_known_rules`, `not_eligible`, `needs_more_info`, `rules_not_verified` |
| Cutoff comparison | 15: `comparable`, `incomparable`, `unavailable` | 16: `comparable_historically`, `not_comparable`, `no_cutoff_record`. 12: `not_assessable` | `comparable`, `not_comparable`, `no_cutoff_record` |
| Scholarship states | 07: `eligible`, `ineligible`, `needs_more_info` | 13: `likely_meets_published_criteria`, ... 15: `published_criteria_seem_met`, ... (three different enums) | `criteria_seem_met`, `criteria_not_met`, `needs_more_info`, `rule_unverified` |
| Shortlist / application status | 02 M13: interested, shortlisted, preparing, applied, offered, not selected | 03: 8 states with `_user_reported` suffixes. 07: separate `shortlist_items.status` and `student_applications.stage` | One `shortlist_status` and one `application_stage_reported` enum, defined once |
| Domain events | 06: `PROFILE_PREFERENCE_UPDATED`, `COLLEGE_SHORTLISTED`, `OFFICIAL_DEADLINE_UPDATED` | 15: `PREFERENCE_CONFIRMED`, `COLLEGE_SAVED`, `ADMISSION_DEADLINE_VERIFIED` | One list in `03` |
| Mentor tool names | 04: `get_student_profile_summary`, `search_institutions`, ... | 15: `get_my_confirmed_academic_summary`, `search_public_colleges`, ... | 15 style (`get_my_*`), defined with JSON schemas in `07` |
| Parent report endpoint | 06: `POST /reports/parent` | 15: `POST /parent-reports` | `POST /api/v1/parent-reports` |
| Priority of NL search | 02: "P1 or P0 narrow demo" | 09: COL-04 is P1 | P1 |
| Priority of admin review | 02 M18: admin UI is P1 | 10 release gate: "Admin data update can be reviewed before publish" (treated as P0) | P0 is a CLI review step, admin UI is P1 |
| Mascot | 11: animation level not decided | 09 M5: "mascot default state animations" planned | Decided in `02_DECISIONS.md` |
| Pack size | Manifest: 19 Markdown docs | ALL_IN_ONE: "18-file requirements package" | v2: 10 files |

## Facts that changed since v1.1 was written (checked 29 Oct 2026)

- **Groq OCR is riskier than v1.1 assumed.** Groq's Llama 4 Scout vision model was deprecated with shutdown on 17 Jul 2026, and Maverick earlier. The only multimodal model Groq currently describes is `qwen/qwen3.8-27b`, which is a **preview** model that "may be discontinued at short notice". So image OCR via Groq cannot be the backbone. v2 makes manual entry and PDF text extraction the P0 path and puts vision behind a switchable adapter.
- **Groq has no Marathi or Hindi text-to-speech.** Its TTS models are Orpheus English and Orpheus Arabic (preview). Speech-to-text is Whisper large v3 / v3 turbo (production), which does accept Hindi and Marathi audio. v2 voice plan: Whisper for input, browser speech synthesis for output, both P1.
- **Vercel now supports FastAPI with zero configuration.** The common pattern is two Vercel projects (web and API) in one repo. v2 picks this and uses Next.js rewrites so the browser sees one origin.
- **India's DPDP Act 2023 and the DPDP Rules 2025 require verifiable parental consent before processing a child's (under 18) personal data.** v1.1 only said "determine consent requirements". v2 names the law and sets a simple rule: the assignment build uses synthetic data only; real students need a parental-consent flow before launch.

## What v2 does differently

- **10 numbered files plus a README, instead of 19.** Every rule, enum and state lives in exactly one place (`03_DOMAIN_RULES.md`). Other files link to it instead of restating it.
- **A ruthless P0** that two people can finish, with an explicit cut list.
- **All open blockers decided** with a proposed default (marked "confirm") in `02_DECISIONS.md`.
- **Concrete content an agent should not invent:** the Mission 1 story graph, the evidence-to-pathway weight table, the scoring formula, the import CSV formats, the SQL schema for P0 tables, the mentor system prompt and tool schemas, and a mentor eval set.
- **"Statewide breadth, two-district depth"** data plan, which satisfies the statewide requirement honestly instead of leaving Q27 open.
- **A two-person build plan** with owners, day estimates and an agent work-order template.
- **Executable test lists** (named Playwright and pytest cases) instead of prose test intentions.
- **Rename proposal:** "Career DNA" becomes "Career Compass". "DNA" says "fixed and innate", which contradicts the pack's own rule that results are exploratory and changeable. Optional; see D-08.

## What v2 deliberately leaves out

- UI/UX design (you are doing it separately). `06` keeps only a route list and the trust-label components, because agents need those to wire screens.
- P2 features (live family room, real-time voice, linked guardian accounts). They stay in the roadmap section of `01` in one paragraph each.
