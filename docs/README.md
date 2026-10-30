# CareerQuest Maharashtra: Planning Pack v2

Planning documents for CareerQuest Maharashtra, an after-Class-10 guidance and college discovery PWA, built by B and Anushka for the Spektra Systems assignment. These files are the source of requirements for humans and AI coding agents. They contain no code and claim no deployment.

## Files

| File | Read it when | Owner |
|---|---|---|
| `00_REVIEW_OF_V1.md` | Once, to see what changed from v1.1 and why | both |
| `01_PRD.md` | Always first. Scope, P0 cut, demo script, metrics | both |
| `02_DECISIONS.md` | Before Day 1, confirm every PROPOSED item | both |
| `03_DOMAIN_RULES.md` | **Binding for all code.** Trust rules, every enum and state | both |
| `04_CAREER_COMPASS.md` | Building the game and its report | B content, Anushka scoring |
| `05_DATA_PIPELINE.md` | Sources, import formats, review, coverage | Anushka, B |
| `06_ARCHITECTURE_AND_API.md` | Repo, database, RLS, API endpoints, limits | both |
| `07_AI_MENTOR.md` | Mentor prompt, tools, memory, fallback, eval set | Anushka |
| `08_BUILD_PLAN.md` | Who does what, day by day, agent work order, PR evidence | both |
| `09_QA_SECURITY_PRIVACY.md` | Named tests, security, DPDP, accessibility | both |

UI/UX design is a separate track and not in this pack. `06` §3 lists the routes and the trust components every screen must use.

## Read order for a coding agent

`03` (binding) → `02` → the spec file for its work package → `06` → `09` for the tests it must make pass. The work order to paste is in `08` §4.

## Precedence when two files disagree

`03_DOMAIN_RULES.md` > `02_DECISIONS.md` > everything else. Fix the lower file in the same PR.

## Writing rule for this pack

Each rule and enum is written once, in `03`. Other files link to it. Do not copy rules into new files.
