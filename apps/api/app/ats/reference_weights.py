"""Configurable reference profile weights (Aavedak approximations — not vendor values)."""

# Jobscan tutorial priority: hard skills (much heavier) > education (advanced degree only) > job title
# > soft skills > other keywords. The numbers are an Aavedak approximation; Jobscan does not publish them.
# Below this many recognised software skills in the JD, hard skills come from the JD's domain phrases.
JOBSCAN_MIN_TAXONOMY_SKILLS = 5
JOBSCAN_WEIGHTS = {"hard": 55, "education": 10, "title": 15, "soft": 12, "other": 8}

# Resume Worded: score reflects how many checks pass (equal weight); Teal Job Match: share of JD
# keywords found. Neither needs a weight table any more.

REZI_WEIGHTS = {
    "content": 0.25,
    "format": 0.2,
    "optimization": 0.2,
    "best_practices": 0.2,
    "application_readiness": 0.15,
}

# Categories + frequency weighting are documented (skillsyncer.com); the point split is an Aavedak estimate.
# Teal Resume Analyzer cards: no published weights. Metrics cards and contact are what Teal flags
# first (free plan shows them), so they count 1.5×; the rest 1×. Aavedak estimate.
TEAL_CARD_WEIGHTS = {
    "Time-based metrics": 1.5,
    "Improvement metric": 1.5,
    "Contact information": 1.5,
    "Skills used inside bullets": 1.25,
}

# Rezi audits inside each category: no published weights. Impact- and targeting-bearing audits
# count more than housekeeping ones. Aavedak estimate.
REZI_AUDIT_WEIGHTS = {
    "Measurable outcomes": 2.0,
    "3–6 bullets per experience entry": 1.5,
    "Contact details present": 1.5,
    "Job-description hard skills covered": 2.0,
    "Job-description keywords covered": 1.5,
    "No keyword stuffing": 1.5,
    "Active voice": 1.25,
    "No buzzwords or filler": 1.25,
}

SKILLSYNCER_POINTS = {"hard": 60, "soft": 15, "other": 5, "title": 10, "degree": 10}

# Enhancv's free checker publicly shows four "Content" checks (ATS Parse Rate, Quantifying
# Impact, Repetition, Spelling & Grammar) as issue counts, not a formula — weights are an
# Aavedak approximation.
ENHANCV_WEIGHTS = {
    "parse_rate": 0.25,
    "quantifying_impact": 0.25,
    "repetition": 0.15,
    "spelling_grammar": 0.20,
    "bullet_length": 0.15,
}

# ── Open-source reference engines (verified against each repo's source; see app/ats/ENGINES.md) ──

# jlynshue/open-ats `three_category_config()` (what its CLI actually uses — not the PRD's 40/20/20/20).
OPEN_ATS_CATEGORY_WEIGHTS = {"keyword": 0.50, "formatting": 0.25, "content_quality": 0.25}
OPEN_ATS_KEYWORD_WEIGHTS = {"hard": 0.50, "soft": 0.25, "action": 0.15, "industry": 0.10}
OPEN_ATS_CONTENT_WEIGHTS = {"action": 0.40, "passive": 0.30, "hedging": 0.20, "word_count": 0.10}
OPEN_ATS_FORMAT_PENALTIES = {
    "table": 10,
    "date_inconsistency": 5,
    "special_char_each": 1,
    "special_char_cap": 10,
    "missing_contact": 15,
    "long_line_cap": 3,
}

# Jahangirhussen/ats-resume-checker `data/ats-rules.json` categoryWeights.
ATS_CHECKER_WEIGHTS = {
    "keywordMatch": 0.22,
    "structure": 0.14,
    "formatting": 0.14,
    "writingQuality": 0.14,
    "achievements": 0.14,
    "experience": 0.10,
    "education": 0.06,
    "contact": 0.06,
}
# "generic" ATS profile strictness (1.0 = no adjustment); strict = 1.25, modern = 0.85 in the reference.
ATS_CHECKER_STRICTNESS = 1.0

# blueabstract/resume-skills-extractor `utils/ats_scorer.py`.
SKILLS_EXTRACTOR_WEIGHTS = {"tfidf": 0.6, "keyword": 0.4}
SKILLS_EXTRACTOR_TFIDF_CALIBRATION = 180  # min(100, round(cosine * 180))

# Anirodh-Padhy/resume-analyzer `src/analyzer/ats_scorer.py` rubric points (max 90 before penalty).
HYBRID_RUBRIC_POINTS = {"skill": 40, "keyword": 30, "length": 20, "missing_penalty_each": 2}
# Aavedak choice: the reference shows rubric and TF-IDF side by side but never combines them.
HYBRID_COMBINE_WEIGHTS = {"rubric": 0.7, "similarity": 0.3}
