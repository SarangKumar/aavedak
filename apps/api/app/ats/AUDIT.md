# ATS engine audit (pre–v2)

Internal audit of Aavedak’s scoring pipeline before engine **2.0**.

## Pipeline map

| #   | Component           | Location                                      | Role                                                                              |
| --- | ------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Resume parser       | `resume_profile.py`                           | Flat extract: contact, sections, skill mentions, bullets, titles, years, stuffing |
| 2   | JD parser           | `jd_profile.py`                               | Required/preferred/responsibilities via section heuristics + alias scan           |
| 3   | Role-only           | `jd_profile` + `skill_taxonomy.ROLE_PROFILES` | Synthesize required from role buckets                                             |
| 4   | Resume-only quality | `analyze.score_resume_quality`                | Actions, metrics, sections, stuffing                                              |
| 5   | Skill extract       | taxonomy aliases + regex boundaries           | Canonical IDs                                                                     |
| 6   | Alias layer         | `skill_taxonomy.py`                           | Safe aliases; short forms removed                                                 |
| 7   | Evidence            | `evidence.py`                                 | Strength 0–1 from section + bullet quality                                        |
| 8   | Responsibilities    | `evidence.responsibility_match`               | Weighted token overlap                                                            |
| 9   | Titles              | `title_similarity`                            | Jaccard + engineer-family boost                                                   |
| 10  | Keywords            | `_jd_keyword_coverage`                        | Residual JD tokens (post–skill filter)                                            |
| 11  | Parseability        | `score_ats_compatibility`                     | Contact/sections/dates/titles/skills                                              |
| 12  | Overall             | `_weighted_mean` + soft caps                  | Mode-specific weights                                                             |
| 13  | Caps                | `_soft_cap` ~88–93                            | Anti-100                                                                          |
| 14  | TS fallback         | `apps/web/lib/ats-analyze-fallback.ts`        | Simplified parallel heuristics                                                    |
| 15  | Python primary      | `analyze.analyze_resume`                      | Called via `/svc/v1/ats/score`                                                    |
| 16  | API                 | `router.py` + web `/api/ats`                  | Batch + single                                                                    |
| 17  | Tests               | **none**                                      | Gap                                                                               |
| 18  | Fixtures            | **none**                                      | Gap                                                                               |
| 19  | Duplication         | Python ↔ TS fallback                          | Drift risk                                                                        |
| 20  | Double-count risk   | skill + keyword + flavor + experience         | Partially mitigated; still present                                                |

## Weaknesses (classified)

| Issue                                                                          | Class                  |
| ------------------------------------------------------------------------------ | ---------------------- |
| Resume is flat (no job/project entities, no per-skill evidence graph)          | parsing                |
| Responsibility match is bag-of-tokens, weak on synonyms                        | NLP/matching           |
| Skills-list vs production evidence still coarse (pre-v2 levels)                | scoring                |
| Preferred skills / keyword / flavor can inflate overall when required are weak | scoring / calibration  |
| No critical-requirement soft ceiling                                           | calibration            |
| Parseability mixed into job-match weights                                      | scoring                |
| No engine version; hard to explain historical scores                           | consistency            |
| Zero automated benchmarks                                                      | consistency            |
| TS fallback diverges from Python                                               | consistency            |
| LinkedIn/GitHub issues can feel like hard ATS myths                            | UX                     |
| Same React bullet can feed skill + keyword + experience flavor                 | scoring (double count) |

## What worked (preserve)

- Mode detection (resume / role / job)
- Soft caps vs hard 100
- Alias safety (no bare `go`/`js`/`ts`)
- Skills-section cannot fake experience via long skill lines
- Residual keyword coverage (excludes required skill tokens)
- Structured ATS issues (title + detail)
- Transparent `weighting` in response
