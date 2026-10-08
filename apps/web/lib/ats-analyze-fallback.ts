/**
 * Local fallback when the Python ATS API is unreachable.
 * Same result shape as apps/api/app/ats/analyze.py — deterministic heuristics only.
 */
import "server-only";

import {
  detectAtsMode,
  scoreBandLabel,
  type AtsAnalysis,
  type AtsImprovement,
  type AtsSkillHit,
} from "@/lib/ats-types";

const ALIASES: Record<string, string[]> = {
  react: ["react", "react.js", "reactjs"],
  nextjs: ["next.js", "nextjs"],
  typescript: ["typescript"],
  javascript: ["javascript"],
  nodejs: ["node.js", "nodejs"],
  python: ["python"],
  postgresql: ["postgresql", "postgres"],
  mysql: ["mysql"],
  aws: ["aws", "amazon web services"],
  docker: ["docker"],
  kubernetes: ["kubernetes", "k8s"],
  rest: ["rest", "rest api", "restful"],
  sql: ["sql"],
  fastapi: ["fastapi"],
  git: ["git", "github"],
};

const ROLE_CORE: Record<string, string[]> = {
  "software engineer": ["typescript", "javascript", "sql", "git", "react", "nodejs"],
  "frontend engineer": ["typescript", "javascript", "react", "nextjs"],
  "backend engineer": ["nodejs", "python", "sql", "rest", "postgresql"],
  "cloud engineer": ["aws", "docker", "kubernetes", "linux"],
};

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function findSkills(text: string): Map<string, { count: number; inExp: boolean }> {
  const lower = text.toLowerCase();
  const map = new Map<string, { count: number; inExp: boolean }>();
  const expIdx = Math.max(lower.indexOf("experience"), 0);
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    let count = 0;
    let inExp = false;
    for (const alias of aliases) {
      let idx = 0;
      while (true) {
        const at = lower.indexOf(alias, idx);
        if (at < 0) break;
        count += 1;
        if (at > expIdx) inExp = true;
        idx = at + alias.length;
      }
    }
    if (count > 0) map.set(canonical, { count, inExp });
  }
  return map;
}

function scoreName(mode: AtsAnalysis["mode"]) {
  if (mode === "resume_only") return "Resume Quality Score";
  if (mode === "role_match") return "Role Match Score";
  return "ATS Match Score";
}

export function analyzeResumeFallback(input: {
  resumeId: string;
  resumeText: string;
  jdText?: string;
  role?: string;
}): AtsAnalysis {
  const text = input.resumeText || "";
  const role = (input.role || "").trim();
  const jd = (input.jdText || "").trim();
  const mode = detectAtsMode(role, jd);
  const lower = text.toLowerCase();
  const skills = findSkills(text);

  if (!text.trim()) {
    return {
      resumeId: input.resumeId,
      mode,
      scoreName: scoreName(mode),
      overallScore: 0,
      scoreLabel: "Could not analyze",
      scores: {},
      matchedSkills: [],
      partialSkills: [],
      missingSkills: [],
      matchedResponsibilities: [],
      partialResponsibilities: [],
      missingResponsibilities: [],
      strengths: [],
      improvements: [],
      atsIssues: ["Empty or unreadable resume text"],
      confidence: "low",
      error: "Could not reliably parse this resume.",
      engine: "fallback",
    };
  }

  let ats = 20;
  const atsIssues: string[] = [];
  if (text.length >= 400) ats += 18;
  else atsIssues.push("Little readable text — PDF may be image-only");
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) ats += 12;
  else atsIssues.push("Add a plain-text email address");
  if (/\+?\d[\d\s().-]{7,}\d/.test(text)) ats += 8;
  else atsIssues.push("Include a phone number in plain text");
  const sections = ["experience", "education", "skills", "projects"].filter((s) =>
    lower.includes(s),
  );
  ats += Math.min(28, sections.length * 7);
  if (lower.includes("linkedin")) ats += 6;
  if (lower.includes("github")) ats += 6;
  if (skills.size >= 6) ats += 8;

  let stuffing = 0;
  for (const s of skills.values()) if (s.count >= 6) stuffing += 1;
  if (stuffing) {
    ats -= 12;
    atsIssues.push("Keyword repetition detected — reduce stuffing");
  }

  const metricBullets = (text.match(/\d+%|\d+[kKmM]\+?|p\d{2}/g) || []).length;
  let quality = 40 + Math.min(20, metricBullets * 5) + Math.min(15, sections.length * 5);
  if (stuffing) quality -= 15;
  quality = clamp(quality);

  const strengths: string[] = [];
  const improvements: AtsImprovement[] = [];
  if (metricBullets) strengths.push(`${metricBullets} measurable signals found`);
  else
    improvements.push({
      priority: "high",
      text: "Add measurable results to 2–3 experience bullets.",
      reason: "Impact metrics improve resume quality signals.",
    });
  if (sections.length >= 3) strengths.push("Clear section organization");

  const scores: AtsAnalysis["scores"] = {
    atsCompatibility: clamp(ats),
    resumeQuality: quality,
    technicalSkills: clamp(skills.size * 10),
    experienceQuality: clamp(45 + metricBullets * 5 + (lower.includes("engineer") ? 10 : 0)),
    structureFormatting: clamp(ats),
    requiredSkills: null,
    preferredSkills: null,
    experienceMatch: null,
    responsibilityMatch: null,
    keywordCoverage: null,
    evidenceQuality: null,
    jobTitleMatch: null,
  };

  const matchedSkills: AtsSkillHit[] = [];
  const partialSkills: AtsSkillHit[] = [];
  const missingSkills: AtsSkillHit[] = [];

  let overall = clamp(
    ats * 0.25 +
      quality * 0.25 +
      (scores.technicalSkills || 0) * 0.2 +
      (scores.experienceQuality || 0) * 0.3,
  );

  if (mode !== "resume_only") {
    const title =
      role ||
      jd
        .split("\n")
        .find((l) => l.trim())
        ?.trim() ||
      "";
    const roleKey =
      Object.keys(ROLE_CORE).find((k) => title.toLowerCase().includes(k)) || "software engineer";
    const required = ROLE_CORE[roleKey] || ROLE_CORE["software engineer"]!;
    // Also pull skills from JD text
    const jdSkills = jd ? findSkills(jd) : new Map();
    const reqList = jdSkills.size ? [...jdSkills.keys()].slice(0, 12) : required;

    let reqSum = 0;
    for (const can of reqList) {
      const hit = skills.get(can);
      if (hit?.inExp) {
        matchedSkills.push({
          skill: can,
          status: "matched",
          matchType: "exact_strong",
          strength: 1,
          evidence: `Found ${can} in experience context`,
        });
        reqSum += 1;
      } else if (hit) {
        partialSkills.push({
          skill: can,
          status: "partial",
          matchType: "exact_weak",
          strength: 0.7,
          evidence: `Listed ${can} (skills-only)`,
        });
        reqSum += 0.7;
      } else {
        missingSkills.push({ skill: can, status: "missing", strength: 0 });
        improvements.push({
          priority: "high",
          text: `If you have experience with ${can}, make it explicit in an experience bullet — do not invent it.`,
          reason: `${can} was expected for this analysis but not evidenced.`,
        });
      }
    }
    const reqScore = clamp((reqSum / Math.max(1, reqList.length)) * 100);
    scores.requiredSkills = reqScore;
    scores.evidenceQuality = clamp(reqScore * 0.85 + (stuffing ? -15 : 0));
    scores.experienceMatch = clamp(50 + metricBullets * 5 + (skills.size > 4 ? 15 : 0));
    scores.jobTitleMatch = title
      ? clamp(
          lower.includes(title.toLowerCase().split(/\s+/)[0] || "")
            ? 85
            : lower.includes("engineer") || lower.includes("developer")
              ? 60
              : 35,
        )
      : null;
    scores.keywordCoverage = reqScore;

    overall = clamp(
      (scores.requiredSkills || 0) * 0.3 +
        (scores.experienceMatch || 0) * 0.2 +
        (scores.evidenceQuality || 0) * 0.15 +
        (scores.jobTitleMatch || 0) * 0.1 +
        (scores.atsCompatibility || 0) * 0.1 +
        quality * 0.15,
    );
  } else {
    scores.evidenceQuality = quality;
  }

  return {
    resumeId: input.resumeId,
    mode,
    scoreName: scoreName(mode),
    overallScore: overall,
    scoreLabel: scoreBandLabel(overall, mode),
    targetTitle: role || undefined,
    scores,
    matchedSkills,
    partialSkills,
    missingSkills,
    matchedResponsibilities: [],
    partialResponsibilities: [],
    missingResponsibilities: [],
    strengths: strengths.slice(0, 8),
    improvements: improvements.slice(0, 10),
    atsIssues: atsIssues.slice(0, 8),
    confidence: text.length > 600 ? "high" : "medium",
    blurb:
      "Calculated from ATS compatibility, skills, experience, responsibilities, keywords, and evidence.",
    engine: "fallback",
    atsScore: overall,
    notes:
      jd && jd.split(/\s+/).length < 40
        ? [
            "Not enough job-description information for a reliable job match. Showing role/resume-weighted analysis.",
          ]
        : [],
  };
}
