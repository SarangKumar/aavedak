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

Rules: pronoun openers, weak openers ("Responsible for"), weak verbs, past tense for past roles, skills
grouping by category ordered by relevance, bullet order within an entry, section order from the role pack
(`data/role_guidance/*.json`, 7 roles + generic). Every candidate change runs through its guard; the whole
revised document runs through `check_document`, and if that fails the original is returned unchanged.

The "before" score is computed on `render(parse(text))`, not the raw PDF text, so the delta measures the
rules rather than whitespace. Tests: `tests/test_improve.py`.
