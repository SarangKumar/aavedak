# ATS engines — methodology, contracts, stages

Single reference for all fifteen engines. All scoring is Python (`engine_runner.py`); the web keeps only the registry (`apps/web/lib/ats-engines/registry.ts`: names, modes, contracts) — no TS fallback. Keep the registry consistent with the Python engines.

| Engine id                                                                                                | Kind        | Modes                                              | Title        | JD           | Score type(s)                                       | When FastAPI is down |
| -------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------- | ------------ | ------------ | --------------------------------------------------- | -------------------- |
| `aavedak`                                                                                                | native      | resume_only, role_match, job_match                 | optional     | optional     | resume_quality / role / job_match                   | Service unavailable  |
| `jobscan_style`, `resume_worded_style`, `teal_style`, `rezi_style`, `skillsyncer_style`, `enhancv_style` | reference   | per `registry.ts`                                  | per registry | per registry | see `apps/web/lib/ats-engines/PROFILE_NOTES.md`     | Service unavailable  |
| `open_ats`                                                                                               | open_source | resume_only, role_match, job_match                 | optional     | optional     | `resume_quality` / `ats_scan`                       | Service unavailable  |
| `ats_resume_checker`                                                                                     | open_source | resume_only, role_match, job_match                 | optional     | optional     | `resume_quality` / `ats_readiness`                  | Service unavailable  |
| `resume_skills_extractor`                                                                                | open_source | role_match, job_match (no resume-only)             | optional     | optional     | `role_match` / `skill_similarity_match`             | Service unavailable  |
| `hybrid_resume_analyzer`                                                                                 | open_source | resume_only, role_match, job_match (JD > 20 chars) | optional     | optional     | `resume_validation` / `role_match` / `hybrid_match` | Service unavailable  |
| `greenhouse_ats`, `lever_ats`, `workable_ats`, `icims_ats`                                               | platform    | resume_only, role_match, job_match                 | optional     | optional     | `parse_readiness` / `application_readiness`         | Service unavailable  |

Title-only mode uses Aavedak's role profile (`role_expected_skills`: core + common skills of `skill_taxonomy.ROLE_PROFILES`) as the comparison target; an unrecognized title fails with `missing_input` rather than scoring against nothing (ATS Resume Checker instead completes with a warning and omits keyword match).

Score types are different measurements (quality, readiness, similarity, match) and are not calibrated against each other.

## Job description input (`jd_input.py`)

Every ATS and Improve request's `jdText` is cleaned when the request is parsed, before any engine runs, with the same cleaner used for imported jobs (`discovery.jobs.jd_clean.strip_boilerplate`). It drops privacy and data-protection notices, cookie banners, equal-opportunity statements and page footers, and returns the text unchanged when nothing applies or too little would be left. Without it, keyword engines read that text as requirements (for example "privacy", "cookies" or "gender" as missing keywords). Only the engines' copy is cleaned; the text in the browser stays as pasted. Tested in `tests/test_jd_input.py` with `tests/fixtures/pasted_jd_with_boilerplate.txt`.

## Shared pipeline (`pipeline.py`)

- `parse_resume_shared` / `parse_jd_shared`: frozen dataclasses of tuples (contact, bullets, date ranges, taxonomy hard skills, soft terms), LRU-cached per exact text. Engines cannot mutate shared data.
- Shared extraction ≠ shared scoring: each engine applies its own formula in `oss_profiles.py`; weights live in `reference_weights.py`.
- `EngineContract` + `resolve_mode` validate inputs before work and raise `EngineFailure(kind)`.
- Failure kinds: `unsupported_mode`, `missing_input`, `parsing_failure`, `analysis_failure` (+ web-only `service_unavailable`). Never shown as a generic N/A.
- TF-IDF: `text_similarity.py`, pure-Python port of scikit-learn `TfidfVectorizer` defaults (smooth idf, optional sublinear tf, l2) with sklearn's own 318-word stop list. Checked against scikit-learn 1.6.1 on the benchmark fixtures: identical to 4 decimals.

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
- Aavedak choices: resume-only excludes keyword match and renormalizes weights (upstream scores an empty list as 100); weak/buzz phrases use word boundaries (upstream substring matched "did" in "candidate"); page-count/OCR checks skipped (text only); `passProbability` omitted (not a probability); the "contact" structure check also passes when an email or phone number is found anywhere in the text, not only under a literal "Contact" heading (most resumes put contact details in the header); "Repeated words" skips words that are capitalized most of the time, since a repeated company/college/product name isn't a writing-quality issue.

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

## Fidelity audit (2026-10-10)

All four upstream repos were re-cloned at the commits above and compared line by line.

- **Open ATS**: weights, penalties, content formula and the action-verb / hedging / passive-marker lists are identical to upstream (62 / 18 / 20 entries, diffed programmatically). Only the documented deviations remain.
- **ATS Resume Checker**: category weights, section aliases, stop words, tech list, strong / weak / buzz lists, bullet splitting and the strictness formula match. Fixed: rounding now follows JavaScript `Math.round` (half up) instead of Python's half-to-even, and the strong-verb lookup strips every non-letter like upstream.
- **Resume Skills Extractor**: formula and calibration match; TF-IDF now uses sklearn's exact stop list.
- **Hybrid Resume Analyzer**: rubric, rule validation and TF-IDF defaults match.

## ATS platform profiles (`platform_profiles.py`, profile 1.0, 2026-10-22)

Four engines that are not resume checkers: each one is a real applicant-tracking system, scored on
**how completely its own documented candidate record can be filled from this resume's text**. These
platforms store an application as structured fields and let recruiters search and filter on them, so
a field the parser cannot fill is a field the recruiter cannot search. Modes: `resume_only` →
`parse_readiness`; `role_match` / `job_match` → `application_readiness`.

`overall = 60% field coverage + 40% recruiter-search coverage` when a title or JD is given, and
field coverage alone without one. Field coverage is the weighted share of that platform's fields the
resume fills (each field 0–1, partly-filled arrays score the share of entries that carry the field);
search coverage is `0.6 ·` share of the posting's skills found `+ 0.4 ·` share of its other
recurring terms (`jd_keywords`), or role-profile skill coverage in `role_match`.

| Engine           | Field model (vendor's own docs, read 2026-10-22)                                                                                                                                                                                                                                                                  | Weighted toward                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `greenhouse_ats` | Job Board API "Submit an application": `first_name`, `last_name`, `email`, `phone`, `location` (+ `latitude`/`longitude`), `employments[company_name, title, start_date{month,year}, end_date, current]`, `educations[school_name_id, degree_id, discipline_id, start_date{month,year}]`, `question_{id}` (links) | month + year dates (.14), employer and title (.12 each), email (.12)                |
| `lever_ats`      | Create an opportunity with `parse=true` → `name`, `headline` (previous companies), `emails`, `phones`, `location`, `company` (current employer), `links`; contact `location` is `{city, region, postalCode, country}`                                                                                             | the seven parsed fields only — emails (.18), headline (.18), location/links (.14)   |
| `workable_ats`   | `POST /jobs/{shortcode}/candidates`: `name`/`firstname`+`lastname`, `email`, `phone`, `address`, `summary`, `experience_entries[title (required), company, industry, current, dates]`, `education_entries[school (required), degree, field_of_study, dates]`, `skills`, `answers`, `social_profiles`              | the required ones — experience `title` (.16), email (.12), education `school` (.09) |
| `icims_ats`      | Candidate profile: basic information (location, email, phone) + Employment, Education, Skills and Links blocks; skills come from a static industry skill list and are extracted from the resume                                                                                                                   | location (.14), email (.14), the Employment block (.14)                             |

- Sources: [docs.greenhouse.io/job-board.html](https://docs.greenhouse.io/job-board.html),
  [hire.lever.co/developer/documentation](https://hire.lever.co/developer/documentation),
  [workable.readme.io](https://workable.readme.io),
  [community.icims.com](https://community.icims.com).
- **Documented vs estimated**: the field _lists_ are the vendors' own. No vendor publishes how it
  weights its fields, so `reference_weights.PLATFORM_FIELD_WEIGHTS` (required fields and the ones
  recruiters filter on weigh most) and `PLATFORM_SEARCH_SHARE = 0.4` are Aavedak estimates. Every
  result says so in `limitations`, together with "not affiliated".
- **Not implemented, deliberately**: **Workday** — its candidate schema is behind the Workday
  Community login, so a field model would be guesswork; and **Ashby** — its public candidate object
  (`name`, `emailAddresses`, `phoneNumbers`, `socialLinks`, `tags`, `source`, `resumeFileHandle`)
  measures nothing the Lever profile does not already cover. Adding either needs a published field
  list, not a blog post.
- Extraction (`extract_record`, LRU-cached per text): name/email/phone/links/skills from
  `pipeline.parse_resume_shared`; the candidate's own location from the first 12 lines via
  discovery's `canonical_location`; employment entries from date ranges in
  `without_education(text)`, each checked for a title, an employer, a month + year on both ends and
  the `Present` marker; education from `education_block(text)` (school name, degree level, field of
  study). Employer and title are text heuristics — employer names are not a closed list — and both
  are listed as a limitation.
- Every unfilled field becomes one finding (severity from the field's weight and how empty it is)
  naming the vendor's own field, plus one improvement whose text is the fix, e.g. "Write dates as
  'Mar 2021 – Jun 2023': month and year on both ends".
- These engines need no inputs: a resume alone answers "can this ATS read me?". `parse_readiness`
  and `application_readiness` are not comparable with the match scores of the other engines.

## Native engine (`aavedak`, engine 3.1 — best-of benchmark, `benchmark.py`)

The native score is the union of the strongest documented criteria across all ten other engines. Resume quality is 11 criteria (0–100 each, weights sum to 1):

| Criterion                    | Weight | What it checks                                                                 | Borrowed from                                    |
| ---------------------------- | ------ | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| ATS parseability             | .12    | readable text, standard headings, table/column/icon artefacts                  | Jobscan formatting, Enhancv parse rate, Open ATS |
| Sections & contact           | .08    | experience/education/skills headings (70) + email/phone (30)                   | Jobscan, Rezi, Resume Worded, ATS Resume Checker |
| Quantified impact            | .15    | share of bullets with a number (target ⅓) + time-bound result                  | Resume Worded, Rezi, Enhancv, Teal               |
| Action verbs                 | .10    | strong-verb openers (target 60%), −10 per weak opener (Assisted, Helped…)      | Resume Worded, Open ATS, ATS Resume Checker      |
| Bullet length & count        | .08    | 8–28 words avg, 3–6 per role, none over 35 words                               | Resume Worded, Rezi, Teal                        |
| Buzzwords, pronouns, passive | .08    | clichés, I/me/my, passive voice, hedging                                       | Rezi, Resume Worded, Open ATS, Jobscan           |
| Verb tense consistency       | .04    | past vs present openers (current role tolerated)                               | Resume Worded                                    |
| Repetition & spelling        | .06    | repeated bullet openers, common typos, doubled words                           | Enhancv, Resume Worded                           |
| Dates & gaps                 | .05    | date ranges present, one format, gaps > 1 year                                 | Rezi, Resume Worded, Enhancv, Jobscan            |
| Length & seniority fit       | .12    | with years of experience: `seniority.py` band checks; without: 400–1,000 words | Resume Worded, Rezi, Enhancv, Jobscan            |
| Skills shown in experience   | .12    | recognised skills that appear in experience/projects, not only a list          | Enhancv, Teal                                    |

- `resume_only`: overall = weighted quality. Every criterion is returned in `breakdown` with its detail line and sources; criteria under 60 become improvements.
- `role_match` / `job_match`: overall = 65% match + 35% quality. Match keeps the evidence-based dimensions (required/preferred skills with synonyms via the taxonomy, responsibilities, experience incl. JD "N+ years" vs stated years, evidence quality, job title) and adds **education & certifications** (.06; degree level incl. B.Tech/M.Tech/BCA/MCA, and any certification the JD names). The critical required-skill protection still caps the final score.
- Degree detection (`detect_degree_level`) now recognises Indian degrees (B.Tech, B.E., B.Sc, BCA, B.Com, M.Tech, M.Sc, MCA, M.E.) — previously a B.Tech resume read as "no degree" for Jobscan and SkillSyncer too.

### Engine 3.1 (2026-10-22) — accuracy and recommendations

- **Action verbs**: the criterion matched 44 hard-coded past-tense words, so a current role written
  in the present tense ("Design and ship …") and ordinary engineering verbs (Integrated, Tuned,
  Wrote, Containerized) counted as _no_ action verb and cost real resumes points. It now matches
  `STRONG_VERB_BASES` (92 bases: Open ATS's 62-verb list, ATS Resume Checker's strong verbs, Resume
  Worded's published guidance, plus common delivery verbs) in every tense, generated by
  `_verb_forms` with an irregular-past table. The reference engines keep their own vendor-faithful
  verb lists.
- **Dates & gaps** is computed on `without_education(text)`: a degree written "2018 – 2022" is no
  longer counted as a second date format, and the years between a degree and a first job are no
  longer an employment gap. Both were common false positives that cost 25–45 points on that
  criterion.
- **Recommendations are actions, not restated diagnoses.** Each criterion now carries a `fix`
  (`Criterion.fix`, also in `breakdown[].fix`): the improvement's `text` is what to change and its
  `reason` holds the measurement, the score and the sources. Before, the text was
  "Quantified impact: 2/12 bullets carry a number (target ≥ ⅓)" — a diagnosis the user had to
  translate into an action.
- **One recommendation per topic** (`_dedupe_improvements`): the legacy quality pass and the
  benchmark criterion both watch action verbs, impact and length; where they overlap the criterion
  wins, so the user never sees two different denominators for one problem. `resume_only` also
  dedupes now (it returned the raw list before).
- Improvements carry a `kind` (`criterion`, `skill_gap`, `platform_field`) and a `key`. The
  "never ask the user to invent experience" rule is asserted on `skill_gap` recommendations, which
  is what it was always about — structural advice carries no such caveat.

## Reference engine audit (2026-10-12)

Each engine compared with the vendor's own pages (fetched 2026-10-12). Vendors publish criteria, not formulas; where a weight isn't published it is marked as an Aavedak estimate.

| Engine                                                                        | Documented criteria (source)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Was                                                                                                                 | Fixed                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Jobscan                                                                       | Match rate = hard skills, education (advanced degree only), job title, soft skills, other keywords; word count, measurable results, job level match, formatting are tips outside the rate ([jobscan.co/resume-scanner](https://www.jobscan.co/resume-scanner))                                                                                                                                                                                                                                                            | matched docs                                                                                                        | degree detection (B.Tech etc.)                                                            |
| Resume Worded                                                                 | 30+ checks in Impact (quantified, weak verbs, tense, repetition), Brevity/style (length, bullet length, filler, buzzwords, passive, pronouns, spelling), Growth & leadership signals, ATS & formatting; "your score reflects how many checks you pass"; checks adapt to career level ([resumeworded.com/score](https://resumeworded.com/score))                                                                                                                                                                           | weighted groups 0.4/0.3/0.3 (unpublished); missing weak-verb, tense, repetition, pronoun, spelling, teamwork checks | score = share of all checks passed; 6 checks added; level calibration kept                |
| Teal                                                                          | Resume Score = Resume Analyzer issue cards: time-based metrics (2 bullets "in/within"), improvement metric (1 bullet with %, range or $), contact, summary, target title, too many skills, 3–5 bullets per position, skills in bullets ([help.tealhq.com](https://help.tealhq.com/en/articles/9524748-using-the-resume-analyzer)); Match Score = how many of the job's keywords (hard, soft, other) appear ([help.tealhq.com](https://help.tealhq.com/en/articles/14435726-how-to-tailor-your-resume-for-a-specific-job)) | Resume Score was an additive points formula unrelated to the cards; Job Match weighted a title (not documented)     | Resume Score = share of the 8 issue cards cleared; Job Match = share of JD keywords found |
| Rezi                                                                          | 5 categories; Content (3–6 bullets, achievements, context, no pronouns), Format (1–2 pages, ≥3 bullets, font size), Optimization (JD keywords), Best Practices (file name, grouped skills, 400–1,600 words, full month+year dates, no buzzwords, active voice), Application Ready ([rezi.ai docs](https://www.rezi.ai/rezi-docs/the-rezi-score-explained))                                                                                                                                                                | matched docs (font size and file name need the PDF/file, not text)                                                  | no change                                                                                 |
| SkillSyncer                                                                   | Match score from hard skills, soft skills, other keywords, job title, degree; frequency-weighted; categories shown separately ([skillsyncer.com](https://skillsyncer.com/resume-scanner-how-to), [sample scan](https://skillsyncer.com/scans/sample))                                                                                                                                                                                                                                                                     | notes called the 60/15/5/10/10 split "documented"                                                                   | relabelled as an Aavedak estimate; degree detection fix                                   |
| Enhancv                                                                       | Two-tier score: parse rate + issues; Content checks = ATS parse rate, quantifying impact, repetition, spelling & grammar, **bullet length and consistency**; Job tailoring = hard skills, soft skills, action verbs, tailored title ([enhancv.com](https://enhancv.com/resources/resume-checker/))                                                                                                                                                                                                                        | no bullet-length check; JD blend used hard skills only                                                              | bullet-length check added; JD tailoring uses all four documented signals                  |
| Open ATS, ATS Resume Checker, Resume Skills Extractor, Hybrid Resume Analyzer | Source code at the commits above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | line-by-line audit 2026-10-10 still holds                                                                           | none needed                                                                               |

Not reproducible from text alone (all engines): file type/size, font size/typeface, file name, page count, header/footer placement, LinkedIn profile match, peer benchmarking.

## Jobscan / Teal / SkillSyncer low-score fixes (profile 1.5, 2026-10-13)

- "Other keywords" came from the raw JD (company pitch, benefits, EEO, punctuation like `businesses.`), Teal took the first 30 by position, and hard/soft skills were counted a second time. Now `jd_keywords()`: discovery JD cleaner + benefits/company sections and a short pre-heading pitch dropped, skills blanked out, top 25 by frequency, matched on light stems (API/APIs, develop/development, cache/caching).
- Soft skills matched exact phrases only; now inflection-aware (mentored → mentoring, collaborate/cross-functional → collaboration).
- Bare "Go" is recognised in list context ("Python, Go", "in Go and …", "Python or Go").
- Section headings like "Professional Experience" / "Technical Skills" are detected; education date ranges are no longer counted as roles (bullets per role).
- Jobscan and SkillSyncer raise `missing_input` without a JD instead of returning 0 or 100.

## Years of experience (engine 2.3, `seniority.py`)

Requests accept optional `yearsExperience` (0–60). The web app always sends the profile's `years_experience` (numeric, 0–50, required in onboarding, editable in settings; backfilled from the old bucket `0-1`→0.5, `1-3`→2, `3-5`→4, `5-8`→6, `8+`→10). The ATS page no longer shows it. Omitted → scores are unchanged.

- Bands: entry <1, junior 1–3, mid 3–6, senior 6–10, staff 10+. Each sets a word-count window, a minimum bullet count and a minimum share of quantified bullets; leadership/ownership signals are expected from mid level. If the resume itself claims more than stated years + 2, a consistency check fails.
- Native: the band checks are the _Length & seniority fit_ criterion (.12 of quality), and nudge `experienceMatch` by ±8 in role/job match. The stated years replace years parsed from the resume when comparing against a JD's "N+ years".
- Resume Worded-style: mirrors Resume Worded's career-level calibration — the fixed "≤ 800 words" check becomes the band's maximum, and the leadership check is dropped below mid level.
- Other engines ignore it. Of the tools we approximate, Resume Worded, Rezi and Enhancv document level-aware checks; Jobscan derives a "job level match" from the resume's own dates (report-only, not in the match rate); Teal and SkillSyncer don't document one.

## Weighting inside each engine (2026-10-12)

No engine score is a plain average of its sub-metrics, except where the vendor documents it:

- **Aavedak** — weighted criteria (`benchmark.QUALITY_WEIGHTS`) and weighted match dimensions.
- **Jobscan** — 55/10/15/12/8 category weights (estimate), frequency-weighted hard skills.
- **Resume Worded** — _unweighted_ share of checks passed, because Resume Worded documents exactly that ("your score reflects how many checks you pass").
- **Teal** — Resume Score: weighted issue cards (`TEAL_CARD_WEIGHTS`: metrics and contact 1.5×, skills in bullets 1.25×). Job Match: share of JD keywords, as Teal documents.
- **Rezi** — category weights (`REZI_WEIGHTS`) over weighted audits (`REZI_AUDIT_WEIGHTS`: impact/targeting audits 1.5–2×); Application Ready uses the category weights instead of a plain mean.
- **SkillSyncer** — 100-point category allocation, frequency-weighted terms.
- **Enhancv** — `ENHANCV_WEIGHTS` over five content checks; JD tailoring .55/.15/.15/.15.
- **OSS engines** — upstream weights (see each section).

The cross-engine **Final score** in the web app is weighted by engine type — see `apps/web/WEB.md`.

## Experience in job matching

ATS scoring calibrates checks to the profile's `years_experience` (level bands). Job
recommendations use the same number separately: discovery shows jobs whose minimum required
years is within `[0, years_experience + experience_window_years]` (default +2; no stated
requirement is included), and the matcher scores how well the stated range fits those years as
one of its eight weighted signals (`discovery/jobs/match.py`). See
`app/discovery/DISCOVERY.md` → "Matching".
