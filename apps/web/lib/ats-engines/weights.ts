/**
 * Configurable approximation weights for reference ATS profiles.
 * Not vendor proprietary values — documented Aavedak defaults for calibration.
 */

export const JOBSCAN_WEIGHTS = {
  hard: 45,
  soft: 15,
  other: 25,
  title: 15,
  /** Advisory only — not added into match total. */
  readabilityAdvisory: true,
} as const;

/** Resume Worded-style check weights (sum = 1). */
export const RESUME_WORDED_WEIGHTS = {
  impact: 0.3,
  skills: 0.25,
  wording: 0.25,
  presentation: 0.2,
} as const;

export const TEAL_JOB_MATCH_WEIGHTS = {
  hard: 55,
  keywords: 30,
  title: 15,
} as const;

/** Rezi-style five category weights (sum = 1). */
export const REZI_WEIGHTS = {
  content: 0.25,
  format: 0.2,
  optimization: 0.2,
  bestPractices: 0.2,
  applicationReadiness: 0.15,
} as const;

/** SkillSyncer publicly documented 100-point allocation. */
export const SKILLSYNCER_POINTS = {
  hard: 60,
  soft: 15,
  other: 5,
  title: 10,
  degree: 10,
} as const;
