# ATS engines — methodology, contracts, stages

Single reference for all ten engines. All scoring is Python (`engine_runner.py`); the web keeps only the registry (`apps/web/lib/ats-engines/registry.ts`: names, modes, contracts) — no TS fallback. Keep the registry consistent with the Python engines.

| Engine id                                                                               | Kind        | Modes                                              | Title        | JD           | Score type(s)                                       | When FastAPI is down |
| --------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------- | ------------ | ------------ | --------------------------------------------------- | -------------------- |
| `aavedak`                                                                               | native      | resume_only, role_match, job_match                 | optional     | optional     | resume_quality / role / job_match                   | Service unavailable  |
| `jobscan_style`, `resume_worded_style`, `teal_style`, `rezi_style`, `skillsyncer_style` | reference   | per `registry.ts`                                  | per registry | per registry | see `apps/web/lib/ats-engines/PROFILE_NOTES.md`     | Service unavailable  |
| `open_ats`                                                                              | open_source | resume_only, role_match, job_match                 | optional     | optional     | `resume_quality` / `ats_scan`                       | Service unavailable  |
| `ats_resume_checker`                                                                    | open_source | resume_only, role_match, job_match                 | optional     | optional     | `resume_quality` / `ats_readiness`                  | Service unavailable  |
| `resume_skills_extractor`                                                               | open_source | role_match, job_match (no resume-only)             | optional     | optional     | `role_match` / `skill_similarity_match`             | Service unavailable  |
| `hybrid_resume_analyzer`                                                                | open_source | resume_only, role_match, job_match (JD > 20 chars) | optional     | optional     | `resume_validation` / `role_match` / `hybrid_match` | Service unavailable  |

Title-only mode uses Aavedak's role profile (`role_expected_skills`: core + common skills of `skill_taxonomy.ROLE_PROFILES`) as the comparison target; an unrecognized title fails with `missing_input` rather than scoring against nothing (ATS Resume Checker instead completes with a warning and omits keyword match).

Score types are different measurements (quality, readiness, similarity, match) and are not calibrated against each other.

## Shared pipeline (`pipeline.py`)

- `parse_resume_shared` / `parse_jd_shared`: frozen dataclasses of tuples (contact, bullets, date ranges, taxonomy hard skills, soft terms), LRU-cached per exact text. Engines cannot mutate shared data.
- Shared extraction ≠ shared scoring: each engine applies its own formula in `oss_profiles.py`; weights live in `reference_weights.py`.
- `EngineContract` + `resolve_mode` validate inputs before work and raise `EngineFailure(kind)`.
- Failure kinds: `unsupported_mode`, `missing_input`, `parsing_failure`, `analysis_failure` (+ web-only `service_unavailable`). Never shown as a generic N/A.
- TF-IDF: `text_similarity.py`, pure-Python port of scikit-learn `TfidfVectorizer` defaults (smooth idf, optional sublinear tf, l2). Stop-word list is shorter than sklearn's → close, not identical.

## Stage protocol

Stage ids: `queued, validating_input, parsing_resume, parsing_job_description, extracting_skills, analyzing_content, matching_keywords, calculating_score, generating_report, completed, completed_with_warnings, failed, cancelled` (mirrored in `apps/web/lib/ats-engines/stages.ts`).

1. Client (`components/ats-hub.tsx`) runs combinations sequentially, one `runId` per resume × engine, and POSTs `/api/ats/run` with `stream: true`.
2. Next route reports `validating_input` (ownership + registry check) and `parsing_resume` (PDF text extraction, once per resume per run), then proxies FastAPI `POST /svc/v1/ats/score-engine/stream` (NDJSON), dropping FastAPI's `validating_input` and consecutive duplicate stages. Next re-sequences `seq` for the client.
3. Engines call `emit(stage)` immediately before doing that work. Legacy engines parse+score in one call and report only `calculating_score`.
4. Exactly one terminal event: `result` (`completed` / `completed_with_warnings` when `warnings` is non-empty) or `failed` with `failureKind`.
5. Client merges via `applyCellUpdate`: other-run events are dropped, lower `seq` is dropped, terminal cells (incl. cancelled) never change for the same run. Cancel aborts the fetch; Retry starts a new run for one cell.

Limitation: if Vercel buffers the Python stream, events still arrive in order but together at the end — no fake intermediate progress is shown either way. `POST /score-engine` (sync JSON) is unchanged; OSS-engine failures return 422 `{failureKind, message}`.

## Result fields (OSS engines; optional elsewhere)

`engineId, engineName, scoreType, scoreScale, methodology{id,version,formula,reference}, breakdown[{key,label,score,weight,contribution,points,maxPoints,parent}], findings[{id,severity,category,title,detail,recommendation}], improvements[].findingId, metrics[], skillCategories[], limitations[], warnings[]` plus the existing `AtsAnalysis` fields. Versions: `<profile>@1.0` (`OSS_PROFILE_VERSION`) — bump on formula changes.

---

## Open ATS — github.com/jlynshue/open-ats (MIT, commit 1fcff98)

Verified in `scoring/engine.py`, `analyzers/{keyword,formatting,content_quality}.py`, `cli/main.py`.

- `overall = 0.50·keyword + 0.25·formatting + 0.25·content_quality` — the CLI's `three_category_config()`. The PRD/README's 40/20/20/20 (with quantification) is **not implemented** upstream, so it is not used.
- `keyword = 0.50·hard + 0.25·soft + 0.15·action + 0.10·industry`; each sub = `min(100, 100·matched/expected)`, **100 when the JD has no terms in that category**; action = distinct strong verbs at bullet start ÷ 10.
- `formatting = 100 − penalties`: table 10, missing email 15, missing name 15, mixed date formats 5, typographic/ASCII separator mix 1 each (cap 10), lines > 120 chars 1 each (cap 3).
- `content = 0.40·action-verb % + 0.30·(100 − passive %) + 0.20·(100 − hedging %) + 0.10·word-count fitness` (100 for 400–800 words, linear to 0 at 100 / 1500).
- Rating: Excellent ≥ 80, Good ≥ 70, Fair ≥ 60, else Poor.
- Adapted (MIT, attributed in code): action-verb, hedging, passive-marker lists; industry terms from its SWE keyword DB.
- Aavedak choices: hard/soft skills from Aavedak's taxonomy (not Open ATS's YAML DB); table detection is a text heuristic (upstream uses DOCX/PDF parser warnings); `Present/Current` is not counted as a date shape (upstream counts it, flagging nearly every resume).
- Without a JD (Aavedak modes; upstream CLI always requires one): **resume_only** = formatting + content reweighted 50/50 (both analyzers ignore the JD upstream), score type `resume_quality`; **role_match** = hard skills from the role profile + action verbs, keyword weights renormalized over those two (soft/industry have no source, so they are skipped instead of credited 100).
- Not verified to match: upstream's structured resume parser (experience entries, header-only contact detection). spaCy/NLTK are declared upstream but unused by these analyzers.

## ATS Resume Checker — github.com/Jahangirhussen/ats-resume-checker (MIT, commit 9bc5875)

Verified in `assets/js/ats-checker.js`, `parser.js`, `validator.js`, `data/*.json` (browser JS; ported to Python).

- Weights (`data/ats-rules.json`): keyword .22, structure .14, formatting .14, writing .14, achievements .14, experience .10, education .06, contact .06. `overall = Σ category·weight`; "generic" ATS profile (strictness 1.0).
- Categories: structure = core sections/5·85 + bonus/8·15; formatting/writing/contact are penalty-from-100 checks with severities; achievements = 0.5·quantified % + 0.5·strong-verb % (40 if no bullets); experience 70 with date ranges / 50 without (no-seniority branch); education 60 + 25 degree + 15 year.
- Keywords: JD tech-stack hits + top-40 frequency terms (cap 35); if < 8 terms and a title is given, adds the title's role skills (Aavedak `role_skill_buckets`) → supports role_match.
- Findings carry severity (critical/high/medium/low) and are sorted; recommendations = top 5 categories by `(100 − score)·weight`, each linked to that category's most severe finding.
- Quality vs. matching kept separate: `metrics.resume_quality` (non-keyword categories, renormalized) and `metrics.keyword_match` are always reported separately.
- Aavedak choices: resume-only excludes keyword match and renormalizes weights (upstream scores an empty list as 100); weak/buzz phrases use word boundaries (upstream substring matched "did" in "candidate"); page-count/OCR checks skipped (text only); `passProbability` omitted (not a probability).

## Resume Skills Extractor — github.com/blueabstract/resume-skills-extractor (commit 3f14d0c)

License: README says MIT but the repo has **no LICENSE file** → only the formula/technique is adapted; no code or skill lists copied. Verified in `utils/ats_scorer.py`, `utils/extractor.py`.

- `overall = 0.6·min(100, round(cosine·180)) + 0.4·(matched JD skills / JD skills)·100`. Cosine: TF-IDF 1–3-grams, English stop words, sublinear tf, max 10 000 features on text cleaned to `[\w\s./#+]`.
- **role_match** (Aavedak): `overall = role skills found / role skills × 100`, score type `role_match`; no TF-IDF (a title is not a document). **No resume_only**: upstream only scores against a JD, so with neither title nor JD the combination is "Needs input".
- Reported separately: raw cosine %, calibrated similarity, keyword ratio, matched / missing / bonus skills, per-category coverage (Aavedak grouping of its own taxonomy), skills-section confidence.
- The ×180 is upstream's calibration heuristic. Similarity is lexical, not semantic, and is not an ATS score on its own.

## Hybrid Resume Analyzer — github.com/Anirodh-Padhy/resume-analyzer (MIT, commit a1b5582)

Verified in `src/analyzer/{ats_scorer,resume_checker,skill_analyzer}.py`, `src/matcher/job_matcher.py`, `app/streamlit_app.py`.

- Upstream rubric: skill `matched/required·40` + keyword `|JD words ∩ resume words| / |JD words|·30` + length (20 for 300–800 unique words, else `min(20, n/300·20)`) − 2 per missing skill → max 90. TF-IDF (default unigram) cosine ×100 is computed separately.
- Upstream "hybrid" is resume **validation**: `0.6·rule_score + 0.4·ML probability > 0.7`, with a pickled TF-IDF + logistic-regression model. **Not used**: Aavedak never loads untrusted pickles, so no ML model runs. Only the rule score is reported (`metrics.rule_validation`); < 60 adds a warning → `completed_with_warnings`.
- **resume_only**: the score is upstream's rule validation (sections ≤ 45 + email 20 + digits 10 + > 150 words 25), score type `resume_validation` — "is this a resume?", not quality.
- **role_match** (Aavedak): rubric = skills 40 + length 20 − penalty against the role profile, normalized from 60; keyword overlap and TF-IDF skipped (need JD text).
- Aavedak combination (configurable `HYBRID_COMBINE_WEIGHTS`): `overall = 0.7·(rubric/90·100) + 0.3·tfidf%`. Upstream shows these side by side and never combines them.
- Aavedak choices: skills via taxonomy word-boundary matching (upstream substring matched "r"/"ai" inside words). Upstream quirk kept: > 800 unique words still earns full length points.
