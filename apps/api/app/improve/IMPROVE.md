# Resume Improver (`app/improve`)

Deterministic, fact-preserving resume rewrites. No LLMs, no network. Design: `docs/resume-improver-design.md`.

| Module         | Role                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------ |
| `structure.py` | Resume text → header / sections / entries / bullets; `render()` gives the canonical text.  |
| `lexicon.py`   | Verb forms, weak phrases, allowed/removable words (`data/*.json`).                         |
| `rules.py`     | Rewrite rules → `Change` objects; `apply_changes()`.                                       |
| `guards.py`    | Rejects any change that adds or alters numbers, dates, contacts, skills or entities.       |
| `alignment.py` | JD or role-profile requirements → supported / skills-only / missing (gaps, never added).   |
| `service.py`   | `improve()` and `score_pair()` (same request for original and revised; only text differs). |
| `router.py`    | `POST /svc/v1/improve`.                                                                    |

Rules: pronoun openers, weak openers ("Responsible for"; "Worked on building X" → "Built X", while
"Helped with" / "Assisted with" stay "Contributed to" so support is never turned into sole credit),
same-meaning verb upgrades to verbs the engines credit (`data/verbs.json` map: make/write → created,
fix → resolved, do → performed; never an ownership verb), past tense for past roles, skills grouping by
category ordered by relevance, bullet order within an entry, section order from the role pack
(`data/role_guidance/*.json`, 7 roles + generic), date format (abbreviated months next to a year are
spelled out: "Jun 2020" → "June 2020"), and contact separators (header lines with 3 or more `|`
separators → `·`; ATS Resume Checker and Enhancv read three pipes on one line as a table). Every
candidate change runs through its guard; the whole revised document runs through `check_document` (role
lines may differ only in month spelling or separator character), and a change that makes it fail is
dropped and reported in `dropped` with the reason.

Score-aware defaults (`improve_and_score`, used by the router): on the first run each accepted change is
measured leave-one-out against the selected engines (score with every change minus score without this
one). A change whose summed effect is negative starts unticked; every change carries its per-engine
`impact` so the UI can show it and the user can still choose it. Toggle runs (`accepted` given) skip the
measurement. Why this exists: the engines credit different things (each has its own strong-verb list, and
ATS Resume Checker counts any 20–220-character line as a bullet, so regrouped skills lines can lower its
Achievements score), so a rewrite that reads better is not automatically a better score.

The "before" score is computed on `render(parse(text))`, not the raw PDF text, so the delta measures the
rules rather than whitespace. Tests: `tests/test_improve.py`.
