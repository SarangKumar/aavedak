import { detectAtsMode, type AtsMode } from "@/lib/ats-types";

import type {
  AnalysisCombination,
  AtsEngineId,
  AtsScoreType,
  EngineCapability,
  EngineRunRequest,
  SharedAtsContext,
} from "./types";

/**
 * Central capability registry. Product configuration — not a claim of vendor APIs
 * or exact proprietary algorithm parity.
 */
export const ATS_ENGINES: EngineCapability[] = [
  {
    id: "aavedak",
    name: "Aavedak ATS",
    shortDescription: "Native evidence-based match & resume quality.",
    kind: "native",
    fallback: "ts",
    supportedModes: ["resume_only", "role_match", "job_match"],
    title: "optional",
    jd: "optional",
    preferredMode: "job_match",
    scoreTypes: ["resume_quality", "role_match", "job_match"],
    scoringProfileId: "aavedak-native",
    profileVersion: "2.0",
    limitations: [
      "Transparent local/API model — not a Workday/Greenhouse/Taleo oracle.",
      "Does not invent experience; skills-list-only evidence is partial.",
    ],
    algoBlurb:
      "Aavedak’s native scorer: evidence-based skills, responsibilities, and resume quality. Optional title and JD sharpen the match.",
  },
  {
    id: "jobscan_style",
    name: "Jobscan",
    shortDescription: "Job-specific keyword & title match (reference).",
    kind: "reference",
    fallback: "ts",
    supportedModes: ["job_match"],
    title: "optional",
    jd: "required",
    preferredMode: "job_match",
    scoreTypes: ["job_match", "ats_readability"],
    scoringProfileId: "jobscan-reference",
    profileVersion: "1.1",
    limitations: [
      "Reference profile inspired by public Jobscan-style features — not Jobscan’s private engine.",
      "Requires a job description for match scoring.",
    ],
    algoBlurb:
      "Compares your resume to one JD. Match score ≈ hard skills 45% + soft 15% + other keywords 25% + title 15%. Readability is shown separately and does not change the match total. Needs a job description.",
  },
  {
    id: "resume_worded_style",
    name: "Resume Worded",
    shortDescription: "Impact, skills, wording & presentation (reference).",
    kind: "reference",
    fallback: "ts",
    supportedModes: ["resume_only", "job_match"],
    title: "optional",
    jd: "optional",
    preferredMode: "resume_only",
    scoreTypes: ["resume_quality", "job_match"],
    scoringProfileId: "resume-worded-reference",
    profileVersion: "1.1",
    limitations: [
      "Reference profile — not Resume Worded’s proprietary scorer.",
      "Title-only is not offered as a separate mode; use resume-only or JD targeting.",
    ],
    algoBlurb:
      "Scores resume quality from impact, skills, wording, and presentation (weighted checks). With a JD, targeting is blended in — it is not a pure job-match score.",
  },
  {
    id: "teal_style",
    name: "Teal",
    shortDescription: "Separate resume score vs job match (reference).",
    kind: "reference",
    fallback: "ts",
    supportedModes: ["resume_only", "job_match"],
    title: "optional",
    jd: "optional",
    preferredMode: "resume_only",
    scoreTypes: ["resume_quality", "job_match"],
    scoringProfileId: "teal-reference",
    profileVersion: "1.1",
    limitations: [
      "Reference profile — Resume Analyzer and Job Matcher kept distinct by mode.",
      "Not affiliated with Teal HQ.",
    ],
    algoBlurb:
      "Two separate scores: Resume Score (structure & content) without a JD, or Job Match (skills + keywords + title) when a JD is provided. Never mixes the two into one number.",
  },
  {
    id: "rezi_style",
    name: "Rezi",
    shortDescription: "Content, format & optimization readiness (reference).",
    kind: "reference",
    fallback: "ts",
    supportedModes: ["resume_only", "job_match"],
    title: "optional",
    jd: "optional",
    preferredMode: "resume_only",
    scoreTypes: ["resume_optimization", "job_match"],
    scoringProfileId: "rezi-reference",
    profileVersion: "1.1",
    limitations: [
      "Reference profile inspired by public Rezi-style checks — not Rezi’s exact product.",
      "Title-only not confirmed as a separate mode.",
    ],
    algoBlurb:
      "Five readiness categories: content, format, optimization, best practices, and application readiness. With a JD, optimization reflects keyword targeting.",
  },
  {
    id: "skillsyncer_style",
    name: "SkillSyncer",
    shortDescription: "Weighted hard/soft/title/degree match (reference).",
    kind: "reference",
    fallback: "ts",
    supportedModes: ["job_match"],
    title: "required",
    jd: "required",
    preferredMode: "job_match",
    scoreTypes: ["weighted_job_match"],
    scoringProfileId: "skillsyncer-reference",
    profileVersion: "1.1",
    limitations: [
      "Uses documented-style weights (hard 60 / soft 15 / other 5 / title 10 / degree 10).",
      "Approximation — not SkillSyncer’s private matching.",
    ],
    algoBlurb:
      "Needs a job title and JD. Score out of 100: hard skills 60 + soft 15 + other keywords 5 + title 10 + degree 10. Keyword frequency matters; empty JD categories get full points. Title is all-or-nothing.",
  },
  {
    id: "open_ats",
    name: "Open ATS",
    shortDescription: "Keyword, formatting & content-quality scan (open source).",
    kind: "open_source",
    referenceRepo: "github.com/jlynshue/open-ats",
    fallback: "none",
    supportedModes: ["resume_only", "role_match", "job_match"],
    title: "optional",
    jd: "optional",
    preferredMode: "job_match",
    scoreTypes: ["resume_quality", "ats_scan"],
    scoreTypeByMode: {
      resume_only: "resume_quality",
      role_match: "ats_scan",
      job_match: "ats_scan",
    },
    scoringProfileId: "open-ats-adapted",
    profileVersion: "1.0",
    limitations: [
      "Aavedak adaptation of Open ATS formulas on extracted text — not the Open ATS CLI itself.",
      "Without a JD: title-only matches the role's skill profile; resume-only scores formatting + content 50/50. Needs the scoring service.",
    ],
    algoBlurb:
      "Open ATS weights from its source: keyword 50% (hard 50 / soft 25 / action verbs 15 / industry 10) + formatting 25% (penalties from 100) + content quality 25% (action verbs, passive voice, hedging, length). Title-only matches the role's skill profile; with neither title nor JD, keyword is skipped.",
  },
  {
    id: "ats_resume_checker",
    name: "ATS Resume Checker",
    shortDescription: "8 weighted categories with severity-ranked fixes (open source).",
    kind: "open_source",
    referenceRepo: "github.com/Jahangirhussen/ats-resume-checker",
    fallback: "none",
    supportedModes: ["resume_only", "role_match", "job_match"],
    title: "optional",
    jd: "optional",
    preferredMode: "resume_only",
    scoreTypes: ["resume_quality", "ats_readiness"],
    scoreTypeByMode: {
      resume_only: "resume_quality",
      role_match: "ats_readiness",
      job_match: "ats_readiness",
    },
    scoringProfileId: "ats-resume-checker-adapted",
    profileVersion: "1.0",
    limitations: [
      "Generic ATS profile only; page-count and OCR checks are skipped (text-only input).",
      "Resume-only mode drops keyword match and renormalizes weights. Needs the scoring service.",
    ],
    algoBlurb:
      "Keyword 22% + structure, formatting, writing, achievements 14% each + experience 10% + education, contact 6% each. Keywords come from the JD (or the title's skill list). Without either, keyword match is left out instead of counted as 100.",
  },
  {
    id: "resume_skills_extractor",
    name: "Resume Skills Extractor",
    shortDescription: "TF-IDF similarity + skill coverage by category (open source).",
    kind: "open_source",
    referenceRepo: "github.com/blueabstract/resume-skills-extractor",
    fallback: "none",
    supportedModes: ["role_match", "job_match"],
    title: "optional",
    jd: "optional",
    preferredMode: "job_match",
    scoreTypes: ["role_match", "skill_similarity_match"],
    scoreTypeByMode: { role_match: "role_match", job_match: "skill_similarity_match" },
    scoringProfileId: "resume-skills-extractor-adapted",
    profileVersion: "1.0",
    limitations: [
      "Similarity is lexical TF-IDF overlap — reported separately; it is not an ATS score by itself.",
      "Needs a job title or JD to compare against. Title-only = skill coverage without similarity. Needs the scoring service.",
    ],
    algoBlurb:
      "60% TF-IDF cosine similarity (1–3 word phrases, ×180 calibration, capped) + 40% share of JD skills found on the resume. Shows matched, missing and bonus skills by category, plus the raw similarity. With only a title, scores coverage of that role's skill profile.",
  },
  {
    id: "hybrid_resume_analyzer",
    name: "Hybrid Resume Analyzer",
    shortDescription: "Skill/keyword rubric combined with text similarity (open source).",
    kind: "open_source",
    referenceRepo: "github.com/Anirodh-Padhy/resume-analyzer",
    fallback: "none",
    supportedModes: ["resume_only", "role_match", "job_match"],
    title: "optional",
    jd: "optional",
    preferredMode: "job_match",
    scoreTypes: ["resume_validation", "role_match", "hybrid_match"],
    scoreTypeByMode: {
      resume_only: "resume_validation",
      role_match: "role_match",
      job_match: "hybrid_match",
    },
    scoringProfileId: "hybrid-resume-analyzer-adapted",
    profileVersion: "1.0",
    limitations: [
      "No ML model is used — the reference's classifier only validates documents and is not loaded.",
      "The 70/30 combination is an Aavedak choice. Resume-only reports the source's resume-validation rule score, not quality.",
    ],
    algoBlurb:
      "Rubric from the reference (skills 40 + keyword overlap 30 + length 20 − 2 per missing skill, out of 90) normalized to 100, combined 70/30 with TF-IDF similarity. Both parts are shown separately. Title-only: skills + length out of 60. Resume-only: the source's rule-based resume validation.",
  },
];

export function getEngine(id: string): EngineCapability | undefined {
  return ATS_ENGINES.find((e) => e.id === id);
}

export function scoreTypeForMode(engine: EngineCapability, mode: AtsMode): AtsScoreType {
  const explicit = engine.scoreTypeByMode?.[mode];
  if (explicit) return explicit;
  if (mode === "resume_only") {
    if (engine.scoreTypes.includes("resume_optimization")) return "resume_optimization";
    if (engine.scoreTypes.includes("resume_quality")) return "resume_quality";
    return engine.scoreTypes[0]!;
  }
  if (mode === "role_match") {
    if (engine.scoreTypes.includes("role_match")) return "role_match";
    return engine.scoreTypes.find((t) => t !== "resume_quality") ?? engine.scoreTypes[0]!;
  }
  if (engine.scoreTypes.includes("weighted_job_match")) return "weighted_job_match";
  if (engine.scoreTypes.includes("job_match")) return "job_match";
  return engine.scoreTypes[0]!;
}

export function scoreTypeLabel(t: AtsScoreType): string {
  switch (t) {
    case "resume_quality":
      return "Resume Quality";
    case "job_match":
      return "Job Match";
    case "role_match":
      return "Role Match";
    case "ats_readability":
      return "ATS Readability";
    case "resume_optimization":
      return "Resume Optimization";
    case "weighted_job_match":
      return "Weighted Job Match";
    case "ats_scan":
      return "ATS Scan";
    case "ats_readiness":
      return "ATS Readiness";
    case "skill_similarity_match":
      return "Skill + Similarity Match";
    case "hybrid_match":
      return "Hybrid Match";
    case "resume_validation":
      return "Resume Validation";
    default:
      return t;
  }
}

function resolveMode(
  engine: EngineCapability,
  role: string,
  jd: string,
  explicit?: AtsMode,
): { mode: AtsMode; ok: boolean; reason?: string } {
  const hasRole = Boolean(role.trim());
  const hasJd = Boolean(jd.trim());
  const desired = explicit ?? detectAtsMode(role, jd);

  // Input requirements first — clearer than mode-mismatch messages
  if (engine.jd === "required" && !hasJd) {
    return {
      mode: "job_match",
      ok: false,
      reason: `${engine.name} requires a job description.`,
    };
  }
  if (engine.title === "required" && !hasRole) {
    return {
      mode: engine.preferredMode,
      ok: false,
      reason: `${engine.name} requires a job title.`,
    };
  }

  if (!engine.supportedModes.includes(desired)) {
    // Title-only → job_match when JD present
    if (desired === "role_match" && engine.supportedModes.includes("job_match") && hasJd) {
      return { mode: "job_match", ok: true };
    }
    // Title-only → resume_only when that mode exists (title-only not a separate product mode)
    if (desired === "role_match" && engine.supportedModes.includes("resume_only") && !hasJd) {
      return {
        mode: "resume_only",
        ok: true,
        reason: "Title-only is not a separate mode for this profile; running resume quality.",
      };
    }
    // Resume-only desired but engine is JD-only
    if (desired === "resume_only" && engine.supportedModes.includes("job_match") && hasJd) {
      return { mode: "job_match", ok: true };
    }
    // Engine needs a comparison target (title or JD) and neither was given
    if (
      desired === "resume_only" &&
      !hasRole &&
      !hasJd &&
      engine.supportedModes.includes("role_match")
    ) {
      return {
        mode: "role_match",
        ok: false,
        reason: `${engine.name} requires a job title or job description.`,
      };
    }
    return {
      mode: desired,
      ok: false,
      reason: `${engine.name} does not support ${desired.replace(/_/g, " ")} mode.`,
    };
  }

  return { mode: desired, ok: true };
}

/**
 * Build resume × engine combinations with readiness status.
 * Does not assume count === resumes × engines.
 */
export function buildCombinations(input: {
  resumeIds: string[];
  engines: EngineRunRequest[];
  shared: SharedAtsContext;
}): AnalysisCombination[] {
  const out: AnalysisCombination[] = [];
  for (const resumeId of input.resumeIds) {
    for (const eng of input.engines) {
      const cap = getEngine(eng.engineId);
      if (!cap) {
        out.push({
          resumeId,
          engineId: eng.engineId as AtsEngineId,
          mode: "resume_only",
          role: "",
          jdText: "",
          status: "unsupported",
          reason: "Unknown scoring engine.",
          scoreType: "resume_quality",
        });
        continue;
      }
      const role = (eng.role ?? input.shared.role ?? "").trim();
      const jdText = (eng.jdText ?? input.shared.jdText ?? "").trim();
      const resolved = resolveMode(cap, role, jdText, eng.mode);
      const scoreType = scoreTypeForMode(cap, resolved.mode);
      if (!resolved.ok) {
        out.push({
          resumeId,
          engineId: cap.id,
          mode: resolved.mode,
          role,
          jdText,
          status: resolved.reason?.includes("require") ? "needs_input" : "unsupported",
          reason: resolved.reason,
          scoreType,
        });
        continue;
      }
      out.push({
        resumeId,
        engineId: cap.id,
        mode: resolved.mode,
        role,
        jdText,
        status: "ready",
        reason: resolved.reason,
        scoreType,
      });
    }
  }
  return out;
}

export function summarizeCombinations(combos: AnalysisCombination[]) {
  const ready = combos.filter((c) => c.status === "ready");
  const needs = combos.filter((c) => c.status === "needs_input");
  const unsupported = combos.filter((c) => c.status === "unsupported");
  return {
    total: combos.length,
    readyCount: ready.length,
    needsCount: needs.length,
    unsupportedCount: unsupported.length,
    ready,
    needs,
    unsupported,
  };
}
