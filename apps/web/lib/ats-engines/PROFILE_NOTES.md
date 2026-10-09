# ATS reference profiles — fidelity notes

> The open-source-adapted engines (Open ATS, ATS Resume Checker, Resume Skills Extractor, Hybrid Resume Analyzer) and the stage protocol are documented in `apps/api/app/ats/ENGINES.md`.

These five engines are **independent Aavedak approximations** inspired by publicly documented product concepts. They are **not** vendor APIs, endorsements, or exact proprietary replicas.

| Profile       | Score type                    | Documented / verified                                                                                                                             | Approximation                                                 |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Jobscan       | Job Match                     | Job-specific match vs one JD; hard/soft/other/title themes; readability often separate                                                            | Weights 45/15/25/15 configurable in `weights.ts`              |
| Resume Worded | Resume Quality / Targeted     | Weighted checks (impact, skills, wording, presentation)                                                                                           | Exact vendor check list & weights unknown                     |
| Teal          | Resume Score **or** Job Match | Two distinct products                                                                                                                             | Separate formulas by mode; weights approximated               |
| Rezi          | Optimization / Readiness      | Content, Format, Optimization, Best Practices, Application Readiness                                                                              | Not the proprietary 23 audits                                 |
| SkillSyncer   | Weighted Job Match            | **100-pt allocation** hard 60 / soft 15 / other 5 / title 10 / degree 10; frequency; empty category full pts; title all-or-nothing; degree 10/5/0 | Alias lists & “other” token extraction are Aavedak heuristics |

## SkillSyncer arithmetic (verified against public docs)

```
overall = hardPts + softPts + otherPts + titlePts + degreePts   # each category capped by allocation
```

- Missing keyword term → 0 points for that term’s share.
- Category absent from JD → full category points.
- Title → 10 if target title phrase found, else 0.
- Degree → 10 if resume ≥ JD requirement, 5 if lower, 0 if none; 10 if JD states no degree.

Calibration fixtures live in `calibration/` — do not bake vendor sample scores into production logic.
