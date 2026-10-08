export type AtsMode = "resume_only" | "role_match" | "job_match";

export type AtsImprovement = {
  priority: "high" | "medium" | "low";
  text: string;
  reason: string;
};

/** Parseability / structure problems that hurt ATS extraction. */
export type AtsIssue = {
  code: string;
  title: string;
  detail: string;
};

/** Accept structured issues or legacy plain strings from older API responses. */
export function normalizeAtsIssues(raw: unknown): AtsIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: AtsIssue[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      out.push({ code: "legacy", title: item.trim(), detail: item.trim() });
      continue;
    }
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const detail = typeof row.detail === "string" ? row.detail.trim() : "";
      if (!title && !detail) continue;
      out.push({
        code: typeof row.code === "string" && row.code ? row.code : "issue",
        title: title || detail,
        detail: detail || title,
      });
    }
  }
  return out;
}

export type AtsSkillHit = {
  skill: string;
  canonical?: string;
  status: "matched" | "partial" | "missing";
  matchType?: string;
  strength?: number;
  evidence?: string;
};

export type AtsResponsibilityHit = {
  text: string;
  status: "matched" | "partial" | "missing";
  strength?: number;
  evidence?: string;
};

export type AtsScores = {
  atsCompatibility?: number | null;
  requiredSkills?: number | null;
  preferredSkills?: number | null;
  experienceMatch?: number | null;
  responsibilityMatch?: number | null;
  keywordCoverage?: number | null;
  evidenceQuality?: number | null;
  jobTitleMatch?: number | null;
  resumeQuality?: number | null;
  technicalSkills?: number | null;
  experienceQuality?: number | null;
  structureFormatting?: number | null;
};

export type AtsAnalysis = {
  resumeId: string;
  mode: AtsMode;
  scoreName: string;
  overallScore: number;
  scoreLabel: string;
  targetTitle?: string;
  scores: AtsScores;
  matchedSkills: AtsSkillHit[];
  partialSkills: AtsSkillHit[];
  missingSkills: AtsSkillHit[];
  matchedResponsibilities: AtsResponsibilityHit[];
  partialResponsibilities: AtsResponsibilityHit[];
  missingResponsibilities: AtsResponsibilityHit[];
  strengths: string[];
  improvements: AtsImprovement[];
  atsIssues: AtsIssue[];
  confidence: "high" | "medium" | "low";
  notes?: string[];
  weighting?: Record<string, number>;
  blurb?: string;
  engine: "fastapi" | "fallback";
  error?: string;
  /** Diagnostic: extracted text length used for this score */
  textChars?: number;
  /** Diagnostic: short fingerprint so identical extracts are obvious */
  textFingerprint?: string;
  /** @deprecated use overallScore */
  atsScore?: number;
};

export function fingerprintText(text: string): string {
  const t = text.trim();
  if (!t) return "empty";
  let h = 2166136261;
  for (let i = 0; i < t.length; i += 1) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${t.length}:${(h >>> 0).toString(16)}`;
}

export function detectAtsMode(role: string, jd: string): AtsMode {
  const hasRole = Boolean(role.trim());
  const hasJd = Boolean(jd.trim());
  if (!hasRole && !hasJd) return "resume_only";
  if (hasJd) return "job_match";
  return "role_match";
}

export function scoreBandLabel(score: number, mode: AtsMode): string {
  const base =
    score >= 90
      ? "Excellent"
      : score >= 80
        ? "Strong"
        : score >= 70
          ? "Good"
          : score >= 60
            ? "Moderate"
            : "Weak";
  if (mode === "resume_only") return `${base} resume quality`;
  if (mode === "role_match") return `${base} role match`;
  return `${base} job match`;
}
