# Resume Improver — design (draft, not implemented)

Status: proposal for review · 2026-10-13 · no code written yet.

## 1. Goal

A free, ATS-guided **Resume Improver**. The user picks one of their resumes and a job title; a JD is optional.

- **Title only:** improve the resume using role guidance plus deterministic rules.
- **With a JD:** also analyse requirements, keyword alignment, missing evidence, and skills the resume already supports.

The output is a revised resume, saved as a new resume next to the untouched original, with before/after ATS scores from the _same_ engine, version, mode and inputs. It never invents skills, experience, employers, dates, achievements or metrics. There are no paid APIs, no LLM inference and no new infrastructure.

## 2. What already exists (reuse, don't rebuild)

| Area                                              | Where                                                                                                                                                                                                                                                     | Reuse                                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Scoring (11 engines; native `aavedak` engine 3.0) | `apps/api/app/ats/` (`engine_runner.py`, `benchmark.py`, `scoring.py`, `analyze.py`), `ENGINES.md`                                                                                                                                                        | Run before and after through the existing `POST /svc/v1/ats/score-engine`. No new scorer. |
| Modes `resume_only` / `role_match` / `job_match`  | `resolve_mode`, `EngineContract`                                                                                                                                                                                                                          | The mode is resolved once, then pinned (`mode` field) for both runs.                      |
| Resume parsing                                    | `resume_profile.py` (`SECTION_ALIASES`, `_extract_bullets`, `_find_skills`, `bullet_has_action/metric`), `pipeline.parse_resume_shared`                                                                                                                   | Section and bullet detection, skill mentions with offsets.                                |
| Skill taxonomy + role profiles                    | `skill_taxonomy.py` (aliases, `normalize_skill`, `ROLE_PROFILES` — 7 roles, `infer_role_key`, `role_skill_buckets`)                                                                                                                                       | Evidence matching and "which skills matter for this title".                               |
| JD parsing                                        | `jd_profile.py`, `evidence.py`; boilerplate stripping `data/jd/boilerplate.json` + `lib/jd-clean.ts`                                                                                                                                                      | Requirement extraction; the JD is cleaned exactly as the ATS page cleans it.              |
| Quality signals                                   | `benchmark.py` (`WEAK_OPENERS`, `HEDGES`, 11 quality criteria), `oss_profiles.py` (Open ATS action-verb / hedging / passive lists — MIT, already attributed; ATS Resume Checker strong / weak / buzz lists — MIT), `reference_signals.py` (passive regex) | The rewrite rules target exactly what the engines measure, using the same lists.          |
| Years of experience                               | `seniority.py`, profile `years_experience`                                                                                                                                                                                                                | Passed unchanged to both runs.                                                            |
| Resume storage                                    | `lib/resumes.ts` (GCS PDF, `extracted_text` via `unpdf`, `ats_score`, `ats_inputs`), `docs/decisions.md` → resumes are **PDF only**                                                                                                                       | The revised resume is stored as a new PDF resume.                                         |
| PDF rendering                                     | `lib/cover-letter-download.ts` (jsPDF, A4 layout) and `docx`                                                                                                                                                                                              | Same libraries for a plain single-column ATS-friendly resume PDF.                         |
| ATS page UI                                       | `components/ats-hub.tsx`, `CollapsibleSection`, `ScoreRing`, `ats-engine-badge`                                                                                                                                                                           | Same step-card pattern and score ring.                                                    |
| Final weighted aggregate                          | `lib/ats-engines/aggregate.ts`                                                                                                                                                                                                                            | Optional: show the aggregate delta when several engines are compared.                     |

Gap: there is **no structured resume model**. The engines parse flat text, and nothing renders a resume.

## 3. Open-source research and licences

**The repo has no LICENSE file** (proprietary / all rights reserved). Copyleft code (GPL / AGPL) can't be copied in, and anything copied must be MIT / Apache / BSD with attribution, as already done for Open ATS.

| Project                      | Licence                                                      | Use                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resume-Matcher (srbhr)       | Apache-2.0                                                   | Ideas only. Its improve flow calls an LLM (Ollama), which is excluded here. Its before/after match-score UX is a good model.                     |
| OpenResume (xitanggg)        | **AGPL-3.0**                                                 | Ideas only (no code): its parser's line-grouping → section → feature-scoring approach for PDFs.                                                  |
| pyresparser                  | **GPL-3.0** + spaCy / NLTK (heavy)                           | Not used.                                                                                                                                        |
| YAKE                         | **AGPL-3.0** (commercial licence on request)                 | Not used.                                                                                                                                        |
| KeyBERT                      | MIT, but needs sentence-transformers (heavy, model download) | Not used. The "rank n-grams by relevance" idea is covered by the existing pure-Python TF-IDF (`text_similarity.py`).                             |
| rake-nltk                    | MIT, needs NLTK                                              | Algorithm only (RAKE is ~40 lines: stop-word-delimited phrases, degree/frequency score). Can be re-implemented if JD phrase extraction needs it. |
| ESCO skills                  | EU open data, CC BY 4.0                                      | Optional later: curated alias rows with attribution. Not a runtime dependency.                                                                   |
| O*NET                        | CC BY 4.0                                                    | Optional later: task statements and skills per occupation to seed role guidance packs, with attribution.                                         |
| Lightcast Open Skills        | Free API with key and terms                                  | Not used (external API, terms).                                                                                                                  |
| Open ATS, ATS Resume Checker | MIT                                                          | Already adapted; reuse the same lists.                                                                                                           |

Bullet heuristics (Google's "XYZ" formula, STAR) are public writing advice. They're used as **checks** ("has an action, a scope, a result?"), never to generate content.

## 4. Proposed design

### 4.1 Components

**API — `apps/api/app/improve/`.** Python, because parsing, taxonomy and scoring are all there, and there is no TS scoring by rule.

- `structure.py` — text → `StructuredResume` (header lines, sections in order, entries, bullets, skills lines), with a source span for every line.
- `rules.py` — pure, deterministic transformations, each returning `Change(kind, section, before, after, reason, rule_id)`.
- `guards.py` — the fact-preservation checks (§4.3). Every change passes or is dropped.
- `alignment.py` — JD / role requirements ↔ resume evidence spans; gaps.
- `render_text.py` — `StructuredResume` → canonical plain text (what gets re-scored).
- `router.py` — `POST /svc/v1/improve` (stateless; returns the revised structure, the text, changes and gaps).
- `data/` — `action_verbs.json` (strong verbs, weak → strong safe map), `weak_phrases.json`, `role_guidance/<role_key>.json`.

**Web.**

- `lib/resume-improver.ts` — orchestrates: load resume text → API improve → score original and revised with a pinned snapshot → render PDF → save as a new resume.
- `app/api/resume-improver/route.ts`.
- A new collapsible section or tab on `/ats` ("Improve resume").
- `lib/resume-pdf.ts` — jsPDF renderer, server-side, so the stored PDF is generated where it is saved.

### 4.2 Algorithms (all deterministic)

1. **Section detection.** Reuse `SECTION_ALIASES`. Classify lines as heading / entry header (title · org · dates) / bullet / skills line / other. Flattened PDF text (few newlines) falls back to the existing sentence-split heuristic, and the run then reports low structure confidence.
2. **Bullet normalisation.** Unify bullet glyphs; trim whitespace and a trailing period consistently; merge PDF-wrapped continuation lines (a line that starts lowercase or follows a line with no terminal punctuation); split bullets over 35 words only at `;`, never mid-claim.
3. **Weak-phrase removal.** Use a fixed list: "Responsible for", "Worked on", "Helped (to)", "Assisted (with|in)", "Involved in", "Tasked with", "Duties included", hedges such as "familiar with" / "exposure to", and first-person pronouns.
   - Remove the phrase only when what remains still starts with a verb or noun phrase from the original.
   - "Helped build X" → "Built X" is **not** allowed, because it changes the claimed ownership. It becomes "Contributed to building X". The verb map encodes ownership-preserving replacements only.
4. **Action-verb strengthening.** Use a small curated map, kept conservative (no map adds scope or ownership): `made → created`, `did → performed`, `handled → managed`, `used → applied`, `helped → supported`, `in charge of → led` (only when the original says "in charge of").
   - A bullet already opening with a strong verb is untouched.
   - Every mapping lives in `action_verbs.json` and is unit-tested.
5. **Tense consistency.** Past entries use past-tense openers. The entry with "Present/Current" dates uses present tense. Conversion uses a curated verb-form table (no inflection guessing); unknown verbs are left alone.
6. **Skills presentation.** Skills lines are parsed into taxonomy-normalised skills.
   - Group them by taxonomy category (Languages, Frameworks, Data, Cloud/DevOps, Tools).
   - Order within a group by relevance (JD required > JD preferred > role core > common > rest).
   - De-duplicate aliases ("JS" and "JavaScript" become one, using the user's own spelling).
   - **Only skills already on the resume** are kept. Nothing is added.
7. **Section ordering.** Use the role pack's preferred order. For example, for entry-level software: Summary? → Skills → Experience → Projects → Education. With ≥ 3 years: Experience before Skills. Sections are moved whole; content is not edited.
8. **Relevance ordering of bullets.** Inside an entry, bullets that evidence JD or role skills move up (a stable sort by evidence score). No bullet is deleted.
9. **Keyword alignment (JD / role).**
   - For each requirement from `jd_profile` (or role-pack skills), find evidence spans in the resume via taxonomy aliases.
   - Classify each requirement:
     - _supported in experience/projects_
     - _listed only in Skills_ (suggest showing it in a bullet; nothing is written)
     - _missing_ (gap)
   - A missing requirement is a **gap shown to the user, never inserted.**
10. **Role guidance packs** (`data/role_guidance/*.json`, one per `ROLE_PROFILES` key, with a generic fallback). Each pack holds the preferred section order, priority skill categories, typical evidence to show (for example, a backend pack lists "APIs you built", "scale/latency", "data stores"), and prompts that become _suggestions_. An unknown title uses the generic pack plus `infer_role_key`, and the UI says so.
11. **Bullet checks (XYZ / STAR as lint, not generation).** Flag bullets with no action, no object, or no result or metric, and output "Add the result if you have it (e.g. how much, how many, how fast)". No numbers are ever suggested.

### 4.3 Fact-preservation guardrails

These checks run per change and again on the whole document. Any violation drops that change and logs it as `rejected` with the reason.

- **Token-class diff.** Extract these from the before and after text:
  - numbers (incl. %, ₹/$, k / M, ranges)
  - dates and years
  - emails, URLs and phone numbers
  - capitalised entity spans (orgs, products, schools; simple regex plus the taxonomy)
  - taxonomy skills
  - degree and certification names

  `after ⊆ before` must hold for every class, **per bullet**, and for the whole document as a multiset (no duplication used to inflate keywords).

- **Allowed new tokens:** only words from the verb map, section headings from a fixed list, and punctuation.
- **Removal limits:** a change may drop only weak phrases or pronouns. It may not remove a number, date, entity or skill (prevents accidentally deleting facts).
- **Ownership words:** "led / managed / owned / architected / founded" may appear in the output only if the same word, or its mapped source ("in charge of"), was in that bullet before.
- **Header lock:** the header (name, contact) and every entry header (titles, orgs, dates) are byte-identical apart from whitespace.
- **Global checks:** total skills set unchanged; no new sections apart from re-titling to standard names ("Tech Stack" → "Skills"); word count may not grow by more than 5%.
- **Tests** cover each rule with adversarial cases (§7).

### 4.4 Scoring flow (honest before/after)

1. **Snapshot**, built and stored once: `{engineId, engineVersion, methodology.version, mode, role, yearsExperience, jdTextHash, cleanedJdText}`. By default the native `aavedak` engine is used; the user can pick any engine that supports the mode.
2. **Score the original** using the canonicalised text from `render_text` of the _unchanged_ structure, not the raw PDF text. Otherwise the delta would include formatting artefacts. Also store the raw-text score for reference.
3. **Score the revised text** with the identical request (same snapshot, `mode` pinned).
4. **If the API reports a different `engineVersion` between the two calls** (a deploy mid-run), discard the result and re-run both. Results are never mixed.
5. **Report** both scores, the delta, the per-criterion breakdown delta (from `breakdown`), the list of applied and rejected changes, and the gaps. A score that stays the same or drops is shown as is ("Score went down 2 points: …which criteria").
6. **Nothing is hardcoded or estimated**; both numbers come from the same engine response shape.

### 4.5 Output and storage

- **Revised resume:**
  - **Structured JSON:** sections → entries → bullets, each with `sourceSpan`.
  - **Canonical text.**
  - **PDF:** rendered by `lib/resume-pdf.ts` with jsPDF, single column, standard fonts and headings, A4, two pages max. This makes it ATS-friendly but _not_ a copy of the original design.
- **Saved as a new resume** with `createResumeFromPdf` and display name `"<original> — improved for <title>"`. It is inactive by default and needs the user's explicit "Save as new resume". The original is never modified.
- **Optional DOCX** via the existing `docx` dependency, so users can restyle it themselves.

### 4.6 Data model (idempotent, in `lib/app-db.ts`)

- `resumes`:
  - `ALTER TABLE resumes ADD COLUMN IF NOT EXISTS source_resume_id TEXT` (links the improved version to the original)
  - `ADD COLUMN IF NOT EXISTS origin TEXT` (`upload` | `improver`)
- New table `resume_improvements`:
  - Identity: `id`, `user_id`, `source_resume_id`, `result_resume_id NULL`, `job_title`, `jd_text NULL`, `jd_hash`.
  - Scores: `engine_snapshot_json`, `score_before`, `score_after`, `breakdown_before_json`, `breakdown_after_json`.
  - Changes and gaps: `changes_json`, `rejected_json`, `gaps_json`.
  - Housekeeping: `created_at`.
- No change to existing contracts. The new resume still obeys per-user resume caps (`lib/profile-limits.ts`) and the "PDF only" rule.

### 4.7 UI flow (on `/ats`, Vinyaas components)

1. **Select resume** (Select) → **Job title** (Input / Combobox of known roles) → **JD** (Textarea, optional; cleaned like the ATS page) → **Engine** (default native; Select).
2. **Improve.** Stage progress reuses the stream pattern if it is cheap; otherwise show a single loading state on that button only.
3. **Result:**
   - Two `ScoreRing`s (before → after) plus the delta, labelled with engine name, version and mode.
   - Breakdown delta table.
   - **Changes** list (before / after diff per bullet, with rule and reason; each change can be toggled off, which re-renders and re-scores).
   - **Gaps** (missing evidence: "JD asks for Kubernetes — not on your resume. Add it only if you've used it.").
   - **Supported skills.**
4. **Actions:** Download PDF / DOCX, _Save as new resume_, Discard.

## 5. Limitations (stated in the UI)

- **PDF layout:** the original's design (columns, fonts, icons) is not reproduced. The revised PDF is a clean single-column version.
- **Text extraction and structure:** detection is heuristic. Multi-column or image PDFs extract poorly. With low structure confidence the improver makes fewer changes (skills grouping and ordering only) and says why.
- **Rules can't add substance:** the biggest score gains (metrics, missing skills) need user input, so the improver lists them as gaps. Scores may rise only a little, stay the same, or drop. This is reported honestly.
- **Engine-specific:** improving for one engine may not move another. Scores are not comparable across engines (`ENGINES.md`).
- **English only. Seven role packs initially plus a generic one.**

## 6. Effort (rough, one developer)

| Phase | Scope                                                                                                   | Effort   |
| ----- | ------------------------------------------------------------------------------------------------------- | -------- |
| 0     | Structure parser + canonical text renderer + guards + tests (no UI)                                     | 2–3 days |
| 1     | Rules: bullets, weak phrases, verbs, tense, skills grouping / ordering, section order; data JSON; tests | 3–4 days |
| 2     | Alignment + gaps (title-only and JD); role packs for 7 roles + generic                                  | 2 days   |
| 3     | Scoring flow with snapshot and version check; `resume_improvements` table; API route                    | 1–2 days |
| 4     | PDF/DOCX renderer + save as new resume (linked)                                                         | 2 days   |
| 5     | `/ats` UI (inputs, result, diff toggles), CHANGELOG, docs (`ENGINES.md` link, `WEB.md`)                 | 2–3 days |

Total is about 2–3 weeks. Phases 0–3 can ship behind the API alone for evaluation on the benchmark fixtures before any UI.

## 7. Test plan

- **Unit (pytest, `apps/api/tests/test_improve_*.py`):**
  - Each rule: positive and negative cases. No-op on already-strong bullets. Idempotence: `improve(improve(x)) == improve(x)`.
  - **Guards:** adversarial cases must be rejected:
    - a verb map that would add "led"
    - a bullet whose number would be dropped or duplicated
    - a skill moved into a bullet
    - a new date
    - a URL change
    - an employer rename
- **Property-style:** over the benchmark fixtures plus synthetic resumes, the token-class multiset of the output ⊆ input; headers and dates are byte-equal.
- **Scoring:**
  - Same snapshot used for both calls (assert request equality minus `resumeText`).
  - A version mismatch triggers a re-run.
  - No-change input → identical scores (delta 0).
  - A deliberately worse revision → negative delta reported, not hidden.
- **Benchmarks:** on `benchmarks/fixtures.py`, improvement never lowers the native score of the "excellent" fixture by more than 1. It reports which criteria moved.
- **Web:** the route test (ownership, caps, PDF-only save) uses the repo's `tsx` + `node:assert` style. The renderer test checks that it fits within two A4 pages and that text extracted with `unpdf` round-trips to the canonical text (so the saved PDF scores the same as the scored text).

## 8. Open questions for the user

1. **Engine:** score with the native engine only, or let the user pick, or show several engines plus the Final weighted score?
2. **Output:** accept a plain single-column PDF (design not preserved), with an optional DOCX? Or only offer suggestions/diff without generating a file?
3. **Saving:** save automatically as a new inactive resume, or only on an explicit click (proposed: explicit)?
4. **Changes:** per-change accept/reject toggles in v1, or all-or-nothing first?
5. **Role guidance:** should packs be seeded from O*NET (CC BY 4.0, needs an attribution line), or hand-written for the 7 existing roles?
6. **Entry point:** a tab on `/ats`, or a button on each resume card in Documents as well?
7. **Placement:** AGENTS.md puts ATS logic in Python. Is a new `app/improve/` package in the API acceptable, or should it live inside `app/ats/`?
