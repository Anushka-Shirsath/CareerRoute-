# 03. Domain Rules, Enums and Trust Labels (single source of truth)

**Every enum, state name, reason code and trust rule lives here and only here.** Code, other docs and prompts must use these exact strings. If you need a new value, add it here first in the same PR.

## 1. Trust rules (non-negotiable)

| ID | Rule |
|---|---|
| T-01 | No fact about a real institution is shown without `source_id` and `academic_year`. |
| T-02 | Unknown is never false and never zero. A missing fee is `null` with status `unknown`, displayed "Fee not verified". A missing hostel is `unknown`, not "No". |
| T-03 | No admission probability, percentage chance or "likely to get in" wording, anywhere, including mentor replies. |
| T-04 | Eligibility, historical cutoff comparison and preference score are three separate outputs. Never merged into one number or label. |
| T-05 | A cutoff is compared only when every key field in §6 matches. Otherwise `not_comparable` with a reason code. |
| T-06 | OCR or PDF extraction is a draft. Only a student-confirmed result feeds insights, Compass or matching. |
| T-07 | Game and marks produce "routes worth exploring", never a verdict. The student can pick any route as their goal. |
| T-08 | The LLM reads only through allowlisted tools that derive the user from the session. It never receives SQL access, service keys, another user's data, or `student_sensitive_attributes`. |
| T-09 | Content inside uploaded files, web pages and chat is data, not instructions. |
| T-10 | Synthetic data is visibly labelled "Demo data" in the UI and has `is_synthetic = true` in the DB. It never mixes into the published real dataset. |
| T-11 | Student-reported statuses are always labelled as student-reported. The app never claims an official status. |
| T-12 | Parent reports contain only sections the student ticked. Raw game choices, chat and sensitive attributes are excluded by default. |
| T-13 | Cost totals show verified institutional fees and student estimates as separate lines. A total that includes an estimate is labelled "Estimated total". |
| T-14 | Fees from different academic years are never averaged or silently mixed. |

## 2. Verification status of any displayed fact

`verification_status` enum:

| Value | Meaning | UI badge |
|---|---|---|
| `official_source` | Parsed from a government or regulator publication, reviewed | "Official, 2025-26" |
| `institution_source` | From the institution's own official site or notice | "College website, 2025-26" |
| `student_reported` | Entered by the student about themselves | "You entered this" |
| `estimate` | Computed from stated assumptions | "Estimate" |
| `unknown` | No trustworthy value | "Not verified" |
| `demo` | Synthetic fixture | "Demo data" |

API shape for any factual field:

```json
{ "value": 18500, "unit": "INR_per_year", "status": "official_source", "source_id": "src_dte_fee_2025", "academic_year": "2025-26" }
```

## 3. Results

- `board`: `SSC_MH`, `CBSE`, `ICSE`
- `result_type`: `official`, `provisional`, `manual`
- `confirmation_state`: `draft`, `confirmed`, `superseded`
- `extraction_method`: `manual`, `pdf_text`, `image_vision`
- `subject_mark_source`: `extracted`, `extracted_then_corrected`, `typed`
- `aggregate_method`: `simple_average_entered` (P0 default), plus one value per sourced rule from R-01, e.g. `ssc_rule_<id>`
- Validation: `0 <= obtained <= maximum`, `maximum > 0`; grade-only subjects allowed (`grade_label` set, `obtained` null); duplicate subject names rejected; unknown values stay `null`, never `0`.
- One `confirmed` result per student. Re-confirming creates a new revision and marks the old one `superseded`.

## 4. Board rules: research task R-01 (Day 1 to 2)

Do not implement any board-specific aggregate until each row below has an official source link in `05` source register.

| Question | Why it matters |
|---|---|
| Which marks does FYJC centralised admission use for SSC, CBSE and ICSE applicants (all subjects, best five, specific subjects)? | FYJC cutoff comparison |
| What merit marks does DTE use for first-year Polytechnic (post-SSC) admission? | Polytechnic cutoff comparison |
| How does ITI admission (DVET) compute merit? | ITI, P1 |
| How are grade-only or additional subjects treated per board? | Input form rules |

Until sourced: show `simple_average_entered` labelled "Average of the subjects you entered (not an official aggregate)", and cutoff comparison returns `not_comparable` with `AGGREGATE_RULE_UNVERIFIED`.

## 5. Matching: three axes

### 5.1 Eligibility (`eligibility_status`)
| Value | When |
|---|---|
| `eligible_by_known_rules` | All published minimum requirements checked and met |
| `not_eligible` | A published requirement is checked and not met |
| `needs_more_info` | A requirement exists but a student input is missing |
| `rules_not_verified` | We have no sourced requirement for this program and year |

### 5.2 Historical cutoff comparison (`cutoff_comparison_status`)
| Value | When |
|---|---|
| `comparable` | A cutoff record matches every key in §6 and the student's aggregate uses the same metric |
| `not_comparable` | Records exist but a key differs or is missing |
| `no_cutoff_record` | No published cutoff for this offering and year |

When `comparable`, show the record plainly: "In 2025-26, Round 1, OPEN, the closing merit was 81.40. Your marks: 84.20 (same metric). Past cutoffs do not predict future admission." Never convert to a chance.

`comparison_reason` codes: `CATEGORY_NOT_PROVIDED`, `QUOTA_MISMATCH`, `ROUND_NOT_SELECTED`, `METRIC_MISMATCH`, `AGGREGATE_RULE_UNVERIFIED`, `RESULT_NOT_CONFIRMED`, `YEAR_NOT_AVAILABLE`.

### 5.3 Preference score
- `utility = Σ(w_i × s_i) / Σ(w_i)` over criteria that are **measured** for this offering.
- `w_i` = student importance 0 to 100. `s_i` in [0, 1] per criterion, defined in the table.
- Criteria with unknown data are excluded from both sums and listed in `unrated_criteria[]`. Results also carry `evidence_coverage` = measured weight / total weight. Sort by `utility`, then by `evidence_coverage` desc, then by name. So a college with lots of unknowns cannot float to the top just because unknowns were ignored.

| Criterion | s_i definition (v1 ranker) | Unknown when |
|---|---|---|
| `affordability` | `1` if verified tuition ≤ 50% of cap, linearly down to `0` at the cap | Tuition `unknown` |
| `proximity` | `1` same city as home, `0.6` same district, `0.3` other district in target list | Location unknown |
| `government` | `1` government or aided, `0` private unaided | Management type unknown |
| `hostel` | `1` hostel `available`, `0` `not_available` | `unknown` |
| `medium` | `1` offering medium matches preference, else `0` | Medium unknown |
| `academic_fit` | `1` if `comparable` and student metric ≥ cutoff, `0.5` if within 5 points below, `0` lower | Not `comparable` |

Store `ranker_version`, weights and per-criterion values with every search response for audit.

### 5.4 Hard filters vs soft preferences
| Student says | Treatment |
|---|---|
| "Only government" | Hard filter on verified management type |
| "Government preferred" | Soft weight |
| "Hostel required" | Hard filter: `available` only; `unknown` shown in a separate collapsed group "Hostel not verified" |
| "Hostel preferred" | Soft weight |
| "Tuition under ₹X" | Hard filter on verified tuition; unknown-fee offerings shown in a separate group, never inside the "under budget" list |
| "English medium" | Hard if marked required, else soft; uses offering medium, not college-wide assumption |

## 6. Cutoff record key

A cutoff row is unique on:
`admission_system, academic_year, offering_id, round, category, quota, merit_metric, extra_dimensions (JSON, e.g. gender, home university, minority), source_document_id`

- `admission_system`: `FYJC_CAP`, `DTE_POLY_CAP`, `DVET_ITI`
- `merit_metric`: free text code per system, e.g. `fyjc_percent`, `dte_poly_merit`, defined in the source register
- Keep `raw_value` (string as published) and `numeric_value` (nullable). `"NA"`, `"-"`, blank → `numeric_value = null`.

## 7. Costs

`cost_line.kind`: `tuition`, `development_fee`, `exam_fee`, `other_institutional`, `hostel`, `mess_food`, `local_transport`, `travel_home`, `books_supplies`, `other_personal`

- Institutional lines (`tuition`, `development_fee`, `exam_fee`, `other_institutional`) come from sources, status `official_source` or `institution_source`, else `unknown`.
- Hostel fee is institutional only if sourced; otherwise the student's estimate with status `estimate`.
- Personal lines are always `estimate` from student input or labelled defaults.
- Output always has three numbers: `verified_institutional_total`, `estimated_personal_total`, `estimated_total` plus `unknown_lines[]`. If any institutional line is `unknown`, `estimated_total` is shown as "at least ₹X".

## 8. Scholarships (P1)

`scholarship_check_status`: `criteria_seem_met`, `criteria_not_met`, `needs_more_info`, `rule_unverified`. Wording: "You may meet the published criteria. This is not an award."

## 9. Shortlist and applications

- `shortlist_status`: `interested`, `shortlisted`, `preparing_documents`, `applied_reported`, `allotted_reported`, `admitted_reported`, `not_selected_reported`, `withdrawn`
- Every `*_reported` value displays "(you reported)".
- Task checklist completion is separate from shortlist status.

## 10. Career Compass

- `compass_coverage`: `early` (fewer than 3 dimensions with ≥ 2 observations), `developing` (3 to 4), `good` (all 5)
- `evidence_type`: `stated_interest`, `choice`, `task_enjoyment`, `task_outcome`, `academic`
- `task_outcome` is recorded but **never** used in route ranking (T-07, and v1 test "good at puzzle, dislikes it").
- `game_session_state`: `in_progress`, `paused`, `completed`, `abandoned`
- Routes (`pathway_id`): `fyjc_science`, `fyjc_commerce`, `fyjc_arts`, `polytechnic_diploma`, `iti_trade`, `vocational`

## 11. Domain events

| Event | Emitted when | Handlers |
|---|---|---|
| `RESULT_CONFIRMED` | Student confirms a result revision | Recompute academic snapshot, re-run matching for saved searches, refresh compass academic readiness |
| `COMPASS_COMPLETED` | Game session completes or student stops and asks for a report | Build compass report |
| `PREFERENCES_UPDATED` | Student saves finder preferences | Re-rank saved search |
| `GOAL_CHANGED` | Student sets a new active route | Regenerate next-steps checklist, keep history |
| `SHORTLIST_CHANGED` | Save, unsave or status change | Refresh dashboard |
| `SOURCE_PUBLISHED` | Admin publishes an import | Invalidate public caches |
| `PARENT_SHARE_REVOKED` | Student revokes a link | Token stops working immediately |

Handlers are idempotent on `(event_type, entity_id, revision)`. P0 runs them synchronously inside the request; no queue needed yet.

## 12. API error codes

`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `RESULT_NOT_CONFIRMED`, `INVALID_ADMISSION_CONTEXT`, `AI_UNAVAILABLE`, `AI_RATE_LIMITED`, `UPLOAD_REJECTED`, `SHARE_EXPIRED_OR_REVOKED`, `CONFLICT`.

## 13. Copy rules

| Do | Don't |
|---|---|
| "Worth exploring" | "You should choose" / "best for you" |
| "Published closing merit in 2025-26 Round 1" | "Cutoff" with no year or round |
| "Fee not verified" | "₹0" or "Free" |
| "You reported: applied" | "Applied" |
| "Based on what you told us and the mission choices" | "Your personality is" |
| "Strong marks in Maths keep Science and Polytechnic open" | "You are a Science student" |

## 14. Glossary (fixed translations go in `apps/web/i18n/glossary.json`)

FYJC (First Year Junior College, Class 11), CAP (Centralised Admission Process), round, category, quota, merit, cutoff / closing merit, intake, aided / unaided, government, medium, hostel, ITI trade, diploma.
