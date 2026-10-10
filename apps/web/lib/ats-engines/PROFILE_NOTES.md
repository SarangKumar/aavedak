# ATS reference profiles — fidelity notes

> The open-source-adapted engines (Open ATS, ATS Resume Checker, Resume Skills Extractor, Hybrid Resume Analyzer) and the stage protocol are documented in `apps/api/app/ats/ENGINES.md`.

These five engines (implemented only in Python: `apps/api/app/ats/reference_profiles.py`) are **independent Aavedak approximations** inspired by publicly documented product concepts. They are **not** vendor APIs, endorsements, or exact proprietary replicas.

| Profile       | Score type                    | Publicly documented (sources: vendor pages)                                                                                                                                                                                        | Approximation                                                                                                                                                                                                                                                               |
| ------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jobscan       | Job Match                     | Tutorial priority: hard skills (much heavier, frequent ones count more) > education (advanced degree only) > job title > soft skills > other keywords. Word count, measurable results and formatting are **not** in the match rate | Weights 55/10/15/12/8 renormalised over the categories the JD asks for; title is exact-or-nothing; when the JD has fewer than 5 recognised software skills, hard skills come from its stemmed domain phrases (calibrated on one real Jobscan scan: FE resume 24 vs 22 here) |
| Resume Worded | Resume Quality / Targeted     | 20+ checks in Impact, Brevity, Style; weighted by importance; 85+ good, 90+ passes every check                                                                                                                                     | Checks are the ones its pages describe; weights 0.4/0.3/0.3 are a guess                                                                                                                                                                                                     |
| Teal          | Resume Score **or** Job Match | Two products; Job Match compares JD keywords (hard and soft skills) to the resume. No formula published                                                                                                                            | Separate formulas by mode; weights approximated                                                                                                                                                                                                                             |
| Rezi          | Optimization / Readiness      | 5 categories, 23 audits; 3–6 bullets per role, 400–1,600 words, full month+year dates, no pronouns, no buzzwords, active voice, grouped skills; bands 90+ / 50–89 / <50                                                            | Category = share of documented audits passed; category weights approximate                                                                                                                                                                                                  |
| SkillSyncer   | Weighted Job Match            | **100-pt allocation** hard 60 / soft 15 / other 5 / title 10 / degree 10; frequency; empty category full pts; title all-or-nothing; degree 10/5/0                                                                                  | Alias lists & “other” token extraction are Aavedak heuristics                                                                                                                                                                                                               |

## SkillSyncer arithmetic (verified against public docs)

```
overall = hardPts + softPts + otherPts + titlePts + degreePts   # each category capped by allocation
```

- Missing keyword term → 0 points for that term’s share.
- Category absent from JD → full category points.
- Title → 10 if target title phrase found, else 0.
- Degree → 10 if resume ≥ JD requirement, 5 if lower, 0 if none; 10 if JD states no degree.

Calibration fixtures live in `calibration/` — do not bake vendor sample scores into production logic.
