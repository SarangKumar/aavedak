/**
 * Shared resume/JD signals for reference scoring profiles.
 * Deterministic heuristics — not embeddings. Word-boundary matching only.
 */

export const HARD_SKILL_ALIASES: Record<string, string[]> = {
  react: ["react", "react.js", "reactjs"],
  typescript: ["typescript", "ts"],
  javascript: ["javascript", "js"],
  python: ["python"],
  java: ["java"],
  nodejs: ["node.js", "nodejs", "node"],
  sql: ["sql"],
  postgresql: ["postgresql", "postgres"],
  mysql: ["mysql"],
  aws: ["aws", "amazon web services"],
  azure: ["azure", "microsoft azure"],
  gcp: ["gcp", "google cloud"],
  docker: ["docker"],
  kubernetes: ["kubernetes", "k8s"],
  fastapi: ["fastapi"],
  django: ["django"],
  flask: ["flask"],
  rest: ["rest api", "restful"],
  graphql: ["graphql"],
  redis: ["redis"],
  kafka: ["kafka"],
  terraform: ["terraform"],
  ci_cd: ["ci/cd", "cicd", "continuous integration"],
};

const SOFT_TERMS = [
  "communication",
  "collaboration",
  "leadership",
  "mentoring",
  "ownership",
  "teamwork",
  "stakeholder",
  "problem solving",
  "agile",
  "scrum",
];

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "your",
  "have",
  "will",
  "are",
  "was",
  "were",
  "our",
  "you",
  "all",
  "any",
  "can",
  "may",
  "not",
  "but",
  "into",
  "about",
  "over",
  "such",
  "than",
  "then",
  "them",
  "they",
  "their",
  "been",
  "being",
  "also",
  "using",
  "use",
  "used",
  "work",
  "team",
  "role",
  "job",
  "years",
  "year",
  "experience",
  "required",
  "requirements",
  "preferred",
  "including",
  "ability",
  "strong",
]);

export type DegreeLevel = 0 | 1 | 2 | 3; // none, bachelor, master, phd+

export type AtsSignals = {
  textLen: number;
  hasEmail: boolean;
  hasPhone: boolean;
  sections: string[];
  hardSkillsResume: string[];
  hardSkillsJd: string[];
  softSkillsResume: string[];
  softSkillsJd: string[];
  actionBullets: number;
  metricBullets: number;
  /** Fraction of role tokens found (0–1). */
  titleHit: number;
  /** True when the full target title phrase appears (case-insensitive). */
  titleExact: boolean;
  degreeResume: DegreeLevel;
  degreeJd: DegreeLevel;
  degreeMention: boolean;
  jdTokens: string[];
  resumeTokens: string[];
  stuffing: number;
  resumeLower: string;
  jdLower: string;
};

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Count case-insensitive whole-phrase occurrences (no mid-word hits). */
export function countPhrase(haystack: string, phrase: string): number {
  const p = phrase.trim().toLowerCase();
  if (!p) return 0;
  const re = new RegExp(`(?<![a-z0-9])${escapeRe(p)}(?![a-z0-9])`, "gi");
  return (haystack.match(re) || []).length;
}

function findHard(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [id, aliases] of Object.entries(HARD_SKILL_ALIASES)) {
    if (aliases.some((a) => countPhrase(lower, a) > 0)) found.push(id);
  }
  return found;
}

function softHits(text: string): string[] {
  const lower = text.toLowerCase();
  return SOFT_TERMS.filter((t) => countPhrase(lower, t) > 0);
}

export function tokens(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of text.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) ?? []) {
    if (STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function detectDegreeLevel(text: string): DegreeLevel {
  const t = text.toLowerCase();
  if (/\b(ph\.?d|doctorate|doctoral)\b/.test(t)) return 3;
  if (/\b(master'?s?|m\.?s\.?|m\.?eng|mba)\b/.test(t)) return 2;
  if (/\b(bachelor'?s?|b\.?s\.?|b\.?a\.?|b\.?eng|undergraduate)\b/.test(t)) return 1;
  if (/\bdegree\b/.test(t)) return 1;
  return 0;
}

export function extractSignals(resumeText: string, jdText = "", role = ""): AtsSignals {
  const text = resumeText || "";
  const lower = text.toLowerCase();
  const jdLower = `${role}\n${jdText}`.toLowerCase();
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 24);
  const actionRe =
    /^(built|developed|designed|implemented|led|owned|created|optimized|improved|reduced|increased|launched|shipped|architected|migrated|automated|delivered)\b/i;
  const actionBullets = lines.filter((l) => actionRe.test(l)).length;
  const metricBullets = lines.filter((l) =>
    /\d+(?:\.\d+)?%|\d+[kKmMbB]\+?|\bp\d{2}\b/.test(l),
  ).length;
  const sections = ["experience", "education", "skills", "projects", "summary"].filter((s) =>
    new RegExp(`(?:^|\\n)\\s*${s}\\b`, "i").test(text),
  );
  const hardSkillsResume = findHard(text);
  const hardSkillsJd = findHard(`${role}\n${jdText}`);
  const softSkillsResume = softHits(text);
  const softSkillsJd = softHits(`${role}\n${jdText}`);
  const roleNorm = role.trim().toLowerCase().replace(/\s+/g, " ");
  const titleExact = roleNorm.length >= 3 && lower.includes(roleNorm);
  const titleTok = roleNorm.split(/[^a-z]+/).filter((t) => t.length > 2);
  const titleHit = titleTok.length
    ? titleTok.filter((t) => countPhrase(lower, t) > 0).length / titleTok.length
    : 0;
  let stuffing = 0;
  for (const id of hardSkillsResume) {
    const n = countPhrase(lower, id);
    if (n >= 6) stuffing += 1;
  }
  const degreeResume = detectDegreeLevel(text);
  const degreeJd = detectDegreeLevel(`${role}\n${jdText}`);
  return {
    textLen: text.trim().length,
    hasEmail: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text),
    hasPhone: /\+?\d[\d\s().-]{7,}\d/.test(text),
    sections,
    hardSkillsResume,
    hardSkillsJd,
    softSkillsResume,
    softSkillsJd,
    actionBullets,
    metricBullets,
    titleHit,
    titleExact,
    degreeResume,
    degreeJd,
    degreeMention: degreeResume > 0,
    jdTokens: tokens(jdText),
    resumeTokens: tokens(text),
    stuffing,
    resumeLower: lower,
    jdLower,
  };
}

export function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Presence coverage. Empty required list → 0 (caller decides “nothing to miss”). */
export function coverage(a: string[], b: string[]): number {
  if (!b.length) return 0;
  const set = new Set(a);
  return b.filter((x) => set.has(x)).length / b.length;
}

export function tokenCoverage(resume: string[], jd: string[]): number {
  if (!jd.length) return 0;
  const set = new Set(resume);
  return jd.filter((t) => set.has(t)).length / jd.length;
}

/**
 * Frequency-aware category points (SkillSyncer-style).
 * - Empty JD category → full points (nothing to miss).
 * - Each JD term gets equal share of maxPoints.
 * - Term score = min(1, resumeCount / max(1, jdCount)) × share.
 * - Duplicate JD listings of the same canonical term are de-duped once.
 */
export function frequencyCategoryPoints(
  terms: string[],
  resumeLower: string,
  jdLower: string,
  maxPoints: number,
  aliases?: Record<string, string[]>,
): { points: number; matched: string[]; missing: string[] } {
  const unique = [...new Set(terms.map((t) => t.toLowerCase()))];
  if (!unique.length) {
    return { points: maxPoints, matched: [], missing: [] };
  }
  const share = maxPoints / unique.length;
  let points = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const term of unique) {
    const phrases = aliases?.[term] ?? [term];
    const jdCount = Math.max(
      1,
      phrases.reduce((n, p) => n + countPhrase(jdLower, p), 0),
    );
    const resumeCount = phrases.reduce((n, p) => n + countPhrase(resumeLower, p), 0);
    if (resumeCount <= 0) {
      missing.push(term);
      continue;
    }
    matched.push(term);
    points += Math.min(1, resumeCount / jdCount) * share;
  }
  return { points, matched, missing };
}

/** SkillSyncer degree component: 10 / 5 / 0, or full 10 when JD has no degree requirement. */
export function skillsyncerDegreePoints(resume: DegreeLevel, jd: DegreeLevel): number {
  if (jd === 0) return 10;
  if (resume === 0) return 0;
  if (resume >= jd) return 10;
  return 5;
}
