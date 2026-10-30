# 01. Product Requirements (v2)

**Project:** CareerQuest Maharashtra
**Context:** Spektra Systems assignment (AI-Native Software Engineer track). Built by B and Anushka with heavy use of AI coding agents.
**Status:** Requirements. Nothing here claims code, a deployment or a verified dataset exists.
**Rules and enums:** defined once in `03_DOMAIN_RULES.md`. This file never redefines them.

## 1. One-line promise

A Class 10 student in Maharashtra enters their marks, sees honest options after 10th, optionally plays a short discovery game, finds real colleges with sourced facts, asks an AI mentor that knows their saved profile, and shares a clear report with their parents.

## 2. Problem

After Class 10, students choose between FYJC (Science, Commerce, Arts), Polytechnic diploma, ITI and vocational routes. The information is split across several government portals, published as PDFs by year, round, category and quota. Fees are scattered. Students are pushed to pick a stream by marks alone, and parents get no simple explanation of costs or alternatives.

## 3. Users

| User | What they need | Success looks like |
|---|---|---|
| **Undecided student** (e.g. SSC, Nashik, 78%) | Low-effort input, non-judgemental help | Sees 3 routes worth exploring and understands why |
| **Decided student** (e.g. CBSE, Pune, wants govt Polytechnic + hostel, no game) | Fast path to program-level matches | Gets sourced fee/cutoff facts in under 3 minutes |
| **Relocating student** (e.g. ICSE, Nagpur to Pune) | Home vs away cost picture | Compares totals without invented hostel fees |
| **Parent / guardian** | Costs, timeline, alternatives in their language | Opens a shared report on their phone (often via WhatsApp) |
| **Evaluator (Spektra)** | A working, coherent, honest system | Completes the demo script in about 10 minutes and can inspect sources, tests and limits |

The data admin is an internal role for B and Anushka, not a product persona in P0.

## 4. Scope

### P0: the demo must do all of this, for real

| # | Capability | Notes |
|---|---|---|
| P0-1 | **Demo entry and accounts** | "Try as demo student" button creates an isolated anonymous session pre-filled with a synthetic student. Real sign-up with email magic link. See D-01. |
| P0-2 | **Marks input** | Manual entry for SSC, CBSE, ICSE with board-aware subject lists. Provisional flag. Upload of a text-based PDF with parsed rows shown for review. Image OCR is P1 (see D-05). Nothing is used until the student confirms. |
| P0-3 | **Academic snapshot** | Per-subject percentages, relative strengths, cautious plain-language observations, routes this keeps open. |
| P0-4 | **Career Compass game (short)** | One mission, about 5 minutes, ~8 decision nodes, one mini-task, one reflection. Fully optional and skippable. |
| P0-5 | **Career Compass report** | Top 3 routes with evidence, academic readiness shown separately, coverage label, student override. |
| P0-6 | **College finder** | Real records for Pune and Nashik (Polytechnic and FYJC) plus a statewide directory layer. Hard filters, then preference ranking. Three separate status axes per result. "Why this?" drawer. |
| P0-7 | **Shortlist and compare** | Save, set status, compare 2 to 3 offerings side by side including cost split (verified vs estimated). |
| P0-8 | **AI mentor (text)** | Groq, tool-calling only, grounded in the student's confirmed profile and published college records. English, Marathi, Hindi replies. Works in a degraded mode when Groq is down. |
| P0-9 | **Dashboard** | Current goal, confirmed result, Compass summary, shortlist, a short next-steps checklist. Persists across reloads and logins. |
| P0-10 | **Parent report** | Student picks sections, previews exactly what is shared, gets an expiring link and a "Share on WhatsApp" button. Printable. Marathi/Hindi/English toggle on the report. |
| P0-11 | **Admission guide (static)** | Per pathway: official portal link, document checklist, "dates: check the official site" unless a verified date exists. |
| P0-12 | **Data provenance** | Every real fact links to a source document with academic year. A public `/data` page shows coverage by district and pathway. |
| P0-13 | **Engineering evidence** | Deployed URL, README, architecture diagram, OpenAPI docs, CI with unit + RLS + E2E + mentor eval results. |

### Explicitly cut from P0 (do not build until P0 passes the demo script)

Image OCR, natural-language college search, voice, animated mascot beyond simple CSS states, Missions 2 and 3, scholarship matching, notifications, admin web UI, linked guardian accounts, family room, Career Mission rewards and replanning, travel-time routing, full Marathi/Hindi UI translation.

### P1: polish, in this order

1. Image OCR via the vision adapter (D-05).
2. Natural-language college search (LLM to validated filter JSON, user confirms).
3. Missions 2 and 3, adaptive mission selection.
4. Scholarship rule checks for a small set of verified schemes.
5. Voice input (Whisper) and spoken replies (browser speech synthesis).
6. Mascot with Rive/Lottie states.
7. Admin review web UI.
8. Full Marathi/Hindi UI strings, human-reviewed.

### P2: roadmap only

Linked guardian accounts with scoped permissions; joint family session with private prep notes and an AI-facilitated summary; real-time voice conversation; statewide fee and hostel depth; deadline notifications; after-12th pathways.

## 5. Non-goals

- Guaranteeing or predicting admission. No probability numbers anywhere.
- Clinical, IQ or personality assessment.
- Submitting applications or payments on government portals.
- Ratings or reputation scores that are not backed by an official or documented source.
- Native mobile apps.
- Training any model on student data.

## 6. The demo script (this is the real acceptance test)

An evaluator on a phone-sized screen, starting from the deployed URL:

1. Opens the site, picks a language, taps **Try as demo student**.
2. Sees pre-filled SSC marks marked "Demo data". Edits one subject, confirms.
3. Reads the academic snapshot.
4. Plays the 5-minute Compass mission (or skips it, both paths work).
5. Sees the Compass report: 3 routes, the evidence for each, readiness shown separately.
6. Picks "Polytechnic", city Pune, filters: government preferred, hostel preferred, fee cap ₹30,000 tuition.
7. Opens "Why this?" on the top result and sees source, year, round, category and any unknowns.
8. Compares two offerings including the home (Nashik) vs Pune cost split.
9. Saves one to the shortlist.
10. Asks the mentor: "Why is this college first for me, and what is not known about it?" The answer cites the student's saved preferences and the real record, and names the missing fields.
11. Reloads. Everything is still there.
12. Creates a parent report with costs and next steps only, opens the share link in a private window, switches it to Marathi.
13. Opens `/data` and sees the coverage table, then the GitHub README with test results.

Pass conditions: no dead buttons, no 404s, no lost state, no fact without a source, no fake number, and the flow still completes if the Groq key is removed (mentor shows its fallback).

## 7. Success metrics

| Area | Measure | Target for submission |
|---|---|---|
| Completeness | Demo script steps that work on the live URL | 13 / 13 |
| Honesty | Real facts shown without source + year | 0 |
| Isolation | Cross-account reads in RLS and API test suite | 0 allowed, suite green |
| Grounding | Mentor eval cases passing (see `07`) | at least 90%, no failures in the "must refuse" group |
| Resilience | Demo script with `GROQ_API_KEY` unset | Completes, mentor shows fallback |
| Mobile | Main flow at 360px width | No horizontal scroll |
| Speed | Finder results on a 4G throttle | Measure and report actual numbers; no invented targets |

## 8. Top risks

| Risk | Mitigation |
|---|---|
| Scope creep | P0 table above is frozen. New ideas go to P1 list. |
| Government data is hard to extract or not reusable | Two-district depth, manual download plus provenance, honest coverage page (`05`) |
| Cutoffs need category, which is sensitive | Optional, explained, stored in a restricted table, never sent to the LLM (`03` §6) |
| Groq model churn (preview models removed) | Model IDs in env vars, provider adapter, fallback mode, nightly eval |
| Minors' data | Synthetic only for the assignment; DPDP parental-consent flow is a launch blocker, not a P0 feature |
| Two people, many agents, conflicting changes | Contracts first, one owner per module, PR template with evidence (`08`) |
