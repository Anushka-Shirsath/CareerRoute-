# 04. Career Compass: Mission Content, Evidence and Scoring

**Owner:** content B, scoring Anushka. **Enums:** `03` §10. **Status:** v0 content and weights, written by the team, not a validated psychometric instrument. Say so in the report footer.

## 1. Design goals

- About 5 minutes, playable one-handed on a phone.
- Fun first: a small story with stakes, not a questionnaire with pictures.
- Every choice is tagged with interest dimensions; the student never sees "right" answers.
- Deterministic and testable. The LLM may rephrase text in P1, but never changes tags or weights.
- Interest and task performance stay separate. Performance is recorded and never ranks routes.

## 2. Dimensions

| Code | Dimension | Typical activity |
|---|---|---|
| `AN` | Analytical curiosity | Finding causes, comparing data, spotting patterns |
| `PM` | Practical making | Building, fixing, hands-on trial |
| `CR` | Creative expression | Designing, visual storytelling, inventing new forms |
| `EN` | Enterprise and organising | Budgets, pricing, deciding, persuading |
| `SO` | Social and service | Helping, explaining, resolving conflict |

Values (not scored as dimensions, used in explanations and a small modifier): `earn_early`, `deep_study`, `creative_freedom`, `helping_people`, `own_business`, `stay_near_home`.

## 3. Mission 1: "The School Innovation Festival"

Stored as `content/compass/mission1.<locale>.yaml`. Tags and weights live only in the `en` file; `mr` and `hi` files contain text keyed by the same IDs (a test enforces identical IDs).

### Node schema

```yaml
id: S2
type: choice            # choice | multi_select | rating | minitask | values
text_key: s2.text
options:
  - id: S2.a
    text_key: s2.a
    tags: { AN: 1.0 }
```

### Node sequence (P0 is linear with one adaptive branch)

`S1 → S2 → S3 → R1 → S4 → S5 → MT(adaptive) → MT_RATE → S6 → V1 → done`

The S1 role choice changes the narrator lines in S2 to S5 (cosmetic only, `text_key` suffix `.role_<x>`), so it feels like your story. Scoring is the same.

| Node | Prompt (English draft) | Options and tags |
|---|---|---|
| **S1** choice | "Your school's Innovation Festival is in 4 days. Your team needs you. What do you grab first?" | a. "The toolbox. Someone has to build the model." `PM:1` · b. "The budget sheet. Let's see what we can afford." `EN:1` · c. "Sketch paper. The stall has to look amazing." `CR:1` · d. "The team list. I'll make sure everyone knows their job." `SO:1` · e. "The judging rules. Let's find out what they score." `AN:1` |
| **S2** choice | "The night before, your working model stops working." | a. "Test each part one by one until I find the fault." `AN:1` · b. "Rebuild it fast with spare parts." `PM:1` · c. "Switch to a poster and short video that shows the idea." `CR:1` · d. "Calm the team and split the fixing work." `SO:1` · e. "Decide what we can drop and still have a good stall." `EN:1` |
| **S3** choice | "Supplies cost ₹600 more than your budget." | a. "Compare prices at three shops and work out the cheapest mix." `AN:0.5, EN:0.5` · b. "Sell snacks at lunch to raise the money." `EN:1` · c. "Make parts from scrap." `PM:1` · d. "Explain the problem to a teacher and ask for help." `SO:1` · e. "Simplify the design so it costs less but still looks good." `CR:1` |
| **R1** multi_select | "So far, which of these would you happily do again? Pick any." | One option per activity the student has seen in S1 to S3 (generated from their path), each carrying that option's tags. Counts as `stated_interest`. "None of these" allowed. |
| **S4** choice | "Visitors keep walking away confused." | a. "Draw a clear diagram anyone can follow." `CR:1` · b. "Run a live demo every 10 minutes." `PM:1` · c. "Talk to each visitor and explain patiently." `SO:1` · d. "Ask five visitors what confused them, then fix that." `AN:1` · e. "Make a one-line pitch that pulls people in." `EN:1` |
| **S5** choice | "Two teammates disagree about the final design and time is running out." | a. "List the facts behind each idea and compare." `AN:1` · b. "Take a quick vote and move on." `EN:1` · c. "Talk to each of them privately first." `SO:1` · d. "Build a quick version of both and test." `PM:1` · e. "Combine the best parts into a new design." `CR:1` |
| **MT** minitask (adaptive) | One short task from the **least chosen** of `AN, PM, CR, EN, SO` after S5 (tie: fixed order AN, PM, CR, EN, SO). Purpose: collect evidence on a dimension the student has not shown. | See §4 |
| **MT_RATE** rating | "Did you enjoy that task?" 1 to 5 stars | `task_enjoyment` for the MT dimension |
| **S6** choice | "The festival is a hit. The principal asks you to lead one thing next year. You pick..." | a. "The science and data corner" `AN:1` · b. "The build workshop" `PM:1` · c. "The art and design wall" `CR:1` · d. "The stall business and sponsors" `EN:1` · e. "The welcome and helper team" `SO:1`. Counts as strong `stated_interest`. |
| **V1** values | "When you think about the next few years, what matters most? Pick up to two." | `earn_early` "Start earning sooner" · `deep_study` "Study a subject deeply for years" · `creative_freedom` "Freedom to create" · `helping_people` "Helping people" · `own_business` "Running my own thing one day" · `stay_near_home` "Staying near home" |

Every node has **Skip** and **Stop and see my report**. Stopping early produces a report with `compass_coverage = early`.

## 4. Mini-tasks (about 45 seconds each, hint available, no timer pressure)

| Dim | Task | Recorded outcome (never used for ranking) |
|---|---|---|
| `AN` | "Visitors per hour: 4, 8, 16, ?" (pick 24 / 32 / 20). Then "What would you measure to know if the stall worked?" (pick one of four) | correct / hints used |
| `PM` | Drag four steps into order to fix a loose fan connection | correct order / attempts |
| `CR` | Pick which of three poster layouts best tells a 10-year-old what the project does | pick (no right answer, recorded as choice) |
| `EN` | Each badge costs ₹10 to make. A table shows how many sell at ₹15, ₹20, ₹30. Pick the price that earns the most. | correct / hints |
| `SO` | A visitor is upset their child broke a model. Pick the reply you would give. | pick (no right answer) |

## 5. Evidence and scoring algorithm (`compass_ruleset = v0.1`)

### 5.1 Per-dimension evidence `e[d]` in [0, 1]

```
choice_raw[d]  = Σ tag weight for d over choices S1..S5
choice[d]      = choice_raw[d] / max_d(choice_raw)            # top dimension = 1; 0 if no choices
stated[d]      = min(1, 0.5 × R1_selected_weight[d] + 1.0 × S6_tag[d])
enjoy[d]       = (MT_RATE − 1) / 4  only for the MT dimension, otherwise "not measured"

e[d] = weighted mean of the measured components with weights
       stated 0.45, choice 0.40, enjoy 0.15
       (if enjoy is not measured for d, divide by 0.85 instead of 1.0)
```

`observations[d]` = number of events where d received any tag weight or rating. Feeds `compass_coverage` (`03` §10).

### 5.2 Route relevance matrix `M[p][d]` (v0, team-authored, review before Day 3)

| Route | AN | PM | CR | EN | SO |
|---|---|---|---|---|---|
| `fyjc_science` | 1.0 | 0.5 | 0.2 | 0.2 | 0.4 |
| `fyjc_commerce` | 0.6 | 0.1 | 0.2 | 1.0 | 0.4 |
| `fyjc_arts` | 0.4 | 0.1 | 1.0 | 0.3 | 0.9 |
| `polytechnic_diploma` | 0.6 | 1.0 | 0.4 | 0.3 | 0.1 |
| `iti_trade` | 0.2 | 1.0 | 0.3 | 0.3 | 0.2 |
| `vocational` | 0.2 | 0.8 | 0.5 | 0.6 | 0.5 |

```
interest[p] = Σ_d M[p][d] × e[d] / Σ_d M[p][d]
```

### 5.3 Values modifier (small, capped)

| Value picked | Adds 0.05 to |
|---|---|
| `earn_early` | `polytechnic_diploma`, `iti_trade`, `vocational` |
| `deep_study` | `fyjc_science`, `fyjc_arts` |
| `creative_freedom` | `fyjc_arts`, `vocational` |
| `own_business` | `fyjc_commerce`, `vocational` |
| `helping_people` | `fyjc_arts`, `fyjc_science` |
| `stay_near_home` | no score change; passed to the finder as a proximity hint (student can turn it off) |

Total modifier per route capped at 0.10. `final[p] = interest[p] + modifier[p]`.

### 5.4 Academic readiness (shown next to each route, never added to the score)

From the confirmed result only:

| Route | Subjects looked at |
|---|---|
| `fyjc_science`, `polytechnic_diploma` | Mathematics, Science |
| `fyjc_commerce` | Mathematics, English |
| `fyjc_arts` | Languages, Social Science |
| `iti_trade`, `vocational` | None specific; shows "No specific subject requirement in our data" |

Band from the average of those subjects: `strong` ≥ 75%, `moderate` 50% to 74%, `limited` < 50%, `not_available` if any is missing. Wording: "Your Maths and Science marks (avg 81%) give a strong base for this route." For `limited`: "Your marks here are lower. Many students still take this route with extra preparation. Talk to a teacher about what it needs." Never "not suitable".

### 5.5 Ranking and output rules

1. Rank by `final[p]`. Ties within 0.03 broken by readiness band (`strong` > `moderate` > `limited` > `not_available`), then by the fixed order in `03` §10.
2. If routes 3 and 4 are within 0.03, say "close call" and show route 4 as an alternative.
3. No game played: the report is "marks-only". Routes are **not ranked**; show which routes the marks keep open and invite the mission.
4. Each top route needs at least two traceable observations (event IDs) or it says "limited evidence".
5. The student can set any route, ranked or not, as their goal (`student_override`).

## 6. Report schema (`GET /api/v1/compass/report`)

```json
{
  "report_id": "uuid",
  "ruleset": "v0.1",
  "generated_at": "2026-11-02T10:00:00Z",
  "mode": "game_and_marks",              
  "coverage": "developing",
  "dimensions": [ { "code": "AN", "evidence": 0.82, "observations": 4 } ],
  "values": ["earn_early"],
  "top_routes": [
    {
      "pathway_id": "polytechnic_diploma",
      "score": 0.71,
      "close_call": false,
      "why": [
        { "text": "You chose to rebuild the model with spare parts", "event_id": "uuid", "evidence_type": "choice" },
        { "text": "You picked the build workshop to lead next year", "event_id": "uuid", "evidence_type": "stated_interest" }
      ],
      "readiness": { "band": "strong", "subjects": ["Mathematics", "Science"], "average": 81.0 },
      "watch_outs": ["Diploma to degree lateral entry rules vary; check the official rules"],
      "try_next": "Watch a 3-minute day-in-the-life of a diploma student"
    }
  ],
  "alternatives": ["fyjc_science"],
  "student_override": null,
  "game_session_ids": ["uuid"]
}
```

`mode` is one of `game_and_marks`, `marks_only`, `game_only`. The UI shows `score` only as a bar, never as a percentage. Narrative text may be polished by the LLM in P1, but it can only use facts present in this JSON.

## 7. Tests (pytest, `services/api/tests/compass/`)

| Test | Expect |
|---|---|
| `test_graph_ids_match_across_locales` | `mr` and `hi` files have the same node and option IDs as `en` |
| `test_every_path_reaches_done` | All 5^5 choice paths through S1 to S5 reach `done`, no dead ends |
| `test_contrasting_paths_differ` | All-PM path ranks `polytechnic_diploma` or `iti_trade` first; all-CR path ranks `fyjc_arts` first |
| `test_task_outcome_ignored` | Changing MT correctness never changes any route score |
| `test_enjoy_only_mt_dimension` | Rating affects only the MT dimension |
| `test_stop_after_s2_is_early` | Coverage `early`, report says limited evidence |
| `test_marks_only_not_ranked` | No game: `mode = marks_only`, routes unranked |
| `test_override_any_route` | Student can set route ranked 6th as goal |
| `test_values_cap` | Two values on the same route add at most 0.10 |
| `test_replay_new_session` | Replay creates a new session; old report kept with `superseded_by` |
| `test_ruleset_version_pinned` | Resuming a session uses the ruleset it started with |

## 8. P1: Missions 2 and 3

"Community Challenge" and "Mini-lab" from v1. Selection rule: pick the mission whose node tags cover the dimensions with the fewest observations. Same scoring code, new content files only.
