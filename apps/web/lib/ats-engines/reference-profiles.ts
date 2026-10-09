import { fingerprintText, scoreBandLabel, type AtsAnalysis, type AtsMode } from "@/lib/ats-types";

import { getEngine } from "./registry";
import {
  clamp,
  coverage,
  extractSignals,
  frequencyCategoryPoints,
  HARD_SKILL_ALIASES,
  skillsyncerDegreePoints,
  tokenCoverage,
} from "./signals";
import type { AtsEngineId, AtsScoreType } from "./types";
import {
  JOBSCAN_WEIGHTS,
  RESUME_WORDED_WEIGHTS,
  REZI_WEIGHTS,
  SKILLSYNCER_POINTS,
  TEAL_JOB_MATCH_WEIGHTS,
} from "./weights";

function baseShell(input: {
  resumeId: string;
  mode: AtsMode;
  scoreName: string;
  scoreType: AtsScoreType;
  overall: number;
  engineId: AtsEngineId;
  profileVersion: string;
  scores: AtsAnalysis["scores"];
  strengths: string[];
  improvements: AtsAnalysis["improvements"];
  atsIssues: AtsAnalysis["atsIssues"];
  matchedSkills?: AtsAnalysis["matchedSkills"];
  missingSkills?: AtsAnalysis["missingSkills"];
  partialSkills?: AtsAnalysis["partialSkills"];
  notes?: string[];
  resumeText: string;
}): AtsAnalysis {
  const eng = getEngine(input.engineId)!;
  return {
    resumeId: input.resumeId,
    mode: input.mode,
    scoreName: input.scoreName,
    overallScore: input.overall,
    scoreLabel: scoreBandLabel(input.overall, input.mode),
    scores: input.scores,
    matchedSkills: input.matchedSkills ?? [],
    partialSkills: input.partialSkills ?? [],
    missingSkills: input.missingSkills ?? [],
    matchedResponsibilities: [],
    partialResponsibilities: [],
    missingResponsibilities: [],
    strengths: input.strengths.slice(0, 8),
    improvements: input.improvements.slice(0, 10),
    atsIssues: input.atsIssues.slice(0, 8),
    confidence:
      input.resumeText.length > 900 ? "high" : input.resumeText.length > 400 ? "medium" : "low",
    notes: [
      ...(input.notes ?? []),
      `profile ${eng.scoringProfileId}@${input.profileVersion} · reference approximation — not a vendor score`,
    ],
    engine: "fallback",
    engineVersion: `${eng.scoringProfileId}@${input.profileVersion}`,
    atsScore: input.overall,
    textChars: input.resumeText.trim().length,
    textFingerprint: fingerprintText(input.resumeText),
    blurb: `${eng.name}: ${eng.shortDescription} Independent Aavedak approximation.`,
  };
}

function skillHits(resume: string[], jd: string[]) {
  const set = new Set(resume);
  const matched = jd
    .filter((s) => set.has(s))
    .map((s) => ({
      skill: s,
      status: "matched" as const,
      strength: 0.85,
      evidence: "Found on resume (canonical skill match)",
    }));
  const missing = jd
    .filter((s) => !set.has(s))
    .map((s) => ({
      skill: s,
      status: "missing" as const,
      strength: 0,
    }));
  return { matched, missing };
}

/**
 * Jobscan-style job match.
 * Formula: hard*W.hard + soft*W.soft + other*W.other + title*W.title (default 45/15/25/15).
 * Readability is advisory (scores.atsCompatibility) and not added to overall.
 */
export function runJobscanStyle(input: {
  resumeId: string;
  resumeText: string;
  role: string;
  jdText: string;
  mode?: AtsMode;
}): AtsAnalysis {
  const s = extractSignals(input.resumeText, input.jdText, input.role);
  const W = JOBSCAN_WEIGHTS;
  const hard = s.hardSkillsJd.length ? coverage(s.hardSkillsResume, s.hardSkillsJd) : 1;
  const softTarget = s.softSkillsJd.length ? s.softSkillsJd : [];
  const soft = softTarget.length ? coverage(s.softSkillsResume, softTarget) : 1;
  const other = s.jdTokens.length ? tokenCoverage(s.resumeTokens, s.jdTokens) : 1;
  const title = s.titleExact ? 1 : s.titleHit;
  const readability = clamp(
    (s.hasEmail ? 20 : 0) +
      (s.hasPhone ? 15 : 0) +
      s.sections.length * 10 +
      Math.min(25, s.textLen / 80) -
      s.stuffing * 8,
  );
  const match = clamp(hard * W.hard + soft * W.soft + other * W.other + title * W.title);
  const { matched, missing } = skillHits(s.hardSkillsResume, s.hardSkillsJd);
  return baseShell({
    resumeId: input.resumeId,
    mode: "job_match",
    scoreName: "Job Match Score",
    scoreType: "job_match",
    overall: match,
    engineId: "jobscan_style",
    profileVersion: "1.1",
    scores: {
      requiredSkills: clamp(hard * 100),
      preferredSkills: clamp(soft * 100),
      keywordCoverage: clamp(other * 100),
      jobTitleMatch: clamp(title * 100),
      atsCompatibility: readability,
      structureFormatting: readability,
    },
    strengths: [
      ...(hard > 0.5 ? [`Hard-skill coverage ${Math.round(hard * 100)}%`] : []),
      ...(title > 0.4 ? ["Title alignment signals present"] : []),
      ...(readability >= 70 ? ["Solid plain-text parseability (advisory)"] : []),
    ],
    improvements: missing.slice(0, 5).map((m) => ({
      priority: "high" as const,
      text: `${m.skill} appears in the JD but not clearly on the resume. Add only if you have genuine experience.`,
      reason: "Hard-skill gap vs JD (Jobscan reference approximation).",
    })),
    atsIssues:
      readability < 60
        ? [
            {
              code: "readability",
              title: "ATS readability signals are weak",
              detail:
                "Contact fields or section headings may be hard for parsers to extract. Advisory — not in match total.",
            },
          ]
        : [],
    matchedSkills: matched,
    missingSkills: missing,
    resumeText: input.resumeText,
    notes: [
      `Match formula: hard×${W.hard} + soft×${W.soft} + other×${W.other} + title×${W.title}. Empty JD category → full credit for that slice.`,
      "Readability is advisory and excluded from the match total.",
    ],
  });
}

/**
 * Resume Worded-style quality score.
 * Formula: impact×0.3 + skills×0.25 + wording×0.25 + presentation×0.2.
 * Job targeting (when mode=job_match) is reported separately in scores — overall stays quality-weighted
 * with an optional targeting blend only when JD hard skills exist (documented approximation).
 */
export function runResumeWordedStyle(input: {
  resumeId: string;
  resumeText: string;
  role: string;
  jdText: string;
  mode?: AtsMode;
}): AtsAnalysis {
  const s = extractSignals(input.resumeText, input.jdText, input.role);
  const mode: AtsMode =
    input.mode === "job_match" || input.mode === "resume_only" || input.mode === "role_match"
      ? input.mode === "role_match"
        ? "resume_only"
        : input.mode
      : input.jdText.trim()
        ? "job_match"
        : "resume_only";
  const W = RESUME_WORDED_WEIGHTS;
  const impact = clamp(18 + s.metricBullets * 12 + s.actionBullets * 4);
  const skills = clamp(20 + s.hardSkillsResume.length * 5 + (s.stuffing ? -15 : 5));
  const wording = clamp(25 + Math.min(30, s.actionBullets * 5) - Math.min(20, s.stuffing * 10));
  const presentation = clamp(
    (s.hasEmail ? 15 : 0) +
      (s.hasPhone ? 10 : 0) +
      s.sections.length * 12 +
      Math.min(20, s.textLen / 100),
  );
  const quality = clamp(
    impact * W.impact + skills * W.skills + wording * W.wording + presentation * W.presentation,
  );
  const target =
    mode === "job_match" && s.hardSkillsJd.length
      ? coverage(s.hardSkillsResume, s.hardSkillsJd)
      : null;
  // Keep quality primary; when targeting, blend 70/30 (documented Aavedak approximation).
  const overall = target != null ? clamp(quality * 0.7 + target * 100 * 0.3) : quality;
  return baseShell({
    resumeId: input.resumeId,
    mode: mode === "job_match" ? "job_match" : "resume_only",
    scoreName: mode === "job_match" ? "Targeted Resume Score" : "Resume Quality Score",
    scoreType: mode === "job_match" ? "job_match" : "resume_quality",
    overall,
    engineId: "resume_worded_style",
    profileVersion: "1.1",
    scores: {
      resumeQuality: quality,
      evidenceQuality: impact,
      technicalSkills: skills,
      structureFormatting: presentation,
      requiredSkills: target != null ? clamp(target * 100) : null,
    },
    strengths: [
      ...(s.metricBullets >= 2 ? [`${s.metricBullets} measurable impact bullets`] : []),
      ...(s.actionBullets >= 3 ? [`${s.actionBullets} action-led bullets`] : []),
    ],
    improvements:
      s.metricBullets < 2
        ? [
            {
              priority: "high" as const,
              text: "Add measurable results to 2–3 bullets where truthful (latency, users, time saved).",
              reason: "Impact check (Resume Worded reference approximation).",
            },
          ]
        : [],
    atsIssues: [],
    resumeText: input.resumeText,
    notes: [
      `Quality = impact×${W.impact} + skills×${W.skills} + wording×${W.wording} + presentation×${W.presentation}.`,
      mode === "job_match"
        ? "With JD: overall = quality×0.7 + hard-skill targeting×0.3 (approximation)."
        : "Resume-quality path — no job-match score without a JD.",
    ],
  });
}

/**
 * Teal-style: separate Resume Score vs Job Match Score by mode.
 */
export function runTealStyle(input: {
  resumeId: string;
  resumeText: string;
  role: string;
  jdText: string;
  mode?: AtsMode;
}): AtsAnalysis {
  const s = extractSignals(input.resumeText, input.jdText, input.role);
  const wantJob = input.mode === "job_match" || (!input.mode && Boolean(input.jdText.trim()));
  if (wantJob && input.jdText.trim()) {
    const W = TEAL_JOB_MATCH_WEIGHTS;
    const hard = s.hardSkillsJd.length ? coverage(s.hardSkillsResume, s.hardSkillsJd) : 1;
    const toks = s.jdTokens.length ? tokenCoverage(s.resumeTokens, s.jdTokens) : 1;
    const title = s.titleExact ? 1 : s.titleHit;
    const overall = clamp(hard * W.hard + toks * W.keywords + title * W.title);
    const { matched, missing } = skillHits(s.hardSkillsResume, s.hardSkillsJd);
    return baseShell({
      resumeId: input.resumeId,
      mode: "job_match",
      scoreName: "Job Match Score",
      scoreType: "job_match",
      overall,
      engineId: "teal_style",
      profileVersion: "1.1",
      scores: {
        requiredSkills: clamp(hard * 100),
        keywordCoverage: clamp(toks * 100),
        jobTitleMatch: clamp(title * 100),
        experienceMatch: clamp(40 + s.actionBullets * 6),
      },
      strengths: hard > 0.4 ? ["Meaningful hard-skill overlap with JD"] : [],
      improvements: missing.slice(0, 4).map((m) => ({
        priority: "medium" as const,
        text: `If you have ${m.skill} experience, evidence it in a bullet — do not invent it.`,
        reason: "Teal Job Matcher gap (reference approximation).",
      })),
      atsIssues: [],
      matchedSkills: matched,
      missingSkills: missing,
      resumeText: input.resumeText,
      notes: [
        `Job Match = hard×${W.hard} + keywords×${W.keywords} + title×${W.title}.`,
        "Separate from Resume Analyzer — this path is job-match only.",
      ],
    });
  }
  const overall = clamp(
    (s.hasEmail ? 12 : 0) +
      (s.hasPhone ? 8 : 0) +
      s.sections.length * 10 +
      Math.min(25, s.actionBullets * 5) +
      Math.min(20, s.metricBullets * 8) +
      Math.min(15, s.hardSkillsResume.length * 2) -
      s.stuffing * 8,
  );
  return baseShell({
    resumeId: input.resumeId,
    mode: "resume_only",
    scoreName: "Resume Score",
    scoreType: "resume_quality",
    overall,
    engineId: "teal_style",
    profileVersion: "1.1",
    scores: {
      resumeQuality: overall,
      atsCompatibility: clamp((s.hasEmail ? 40 : 10) + s.sections.length * 12),
      experienceQuality: clamp(30 + s.actionBullets * 8 + s.metricBullets * 10),
    },
    strengths: s.sections.length >= 3 ? ["Core sections detected"] : [],
    improvements:
      s.actionBullets < 3
        ? [
            {
              priority: "high" as const,
              text: "Rewrite bullets to start with clear actions and outcomes.",
              reason: "Teal Resume Analyzer (reference approximation).",
            },
          ]
        : [],
    atsIssues: [],
    resumeText: input.resumeText,
    notes: ["Resume Analyzer path — no Job Match Score without a job description."],
  });
}

/**
 * Rezi-style five-category readiness.
 * overall = content×0.25 + format×0.2 + optimization×0.2 + bestPractices×0.2 + applicationReadiness×0.15
 */
export function runReziStyle(input: {
  resumeId: string;
  resumeText: string;
  role: string;
  jdText: string;
  mode?: AtsMode;
}): AtsAnalysis {
  const s = extractSignals(input.resumeText, input.jdText, input.role);
  const mode: AtsMode =
    input.mode === "job_match" || (!input.mode && Boolean(input.jdText.trim()))
      ? "job_match"
      : "resume_only";
  const W = REZI_WEIGHTS;
  const content = clamp(
    20 + s.actionBullets * 6 + s.metricBullets * 8 + s.hardSkillsResume.length * 2,
  );
  const format = clamp(
    (s.hasEmail ? 20 : 0) +
      (s.hasPhone ? 15 : 0) +
      s.sections.length * 12 +
      (s.textLen > 600 ? 15 : 5),
  );
  const optimization = clamp(
    30 +
      (mode === "job_match" && s.hardSkillsJd.length
        ? coverage(s.hardSkillsResume, s.hardSkillsJd) * 40
        : 20) +
      (s.stuffing ? -20 : 10),
  );
  const bestPractices = clamp(
    (s.actionBullets >= 3 ? 25 : 10) +
      (s.metricBullets >= 1 ? 25 : 5) +
      (s.stuffing ? 0 : 25) +
      (s.sections.includes("experience") ? 25 : 10),
  );
  const applicationReadiness = clamp(
    (s.hasEmail ? 30 : 0) +
      (s.hasPhone ? 20 : 0) +
      (s.sections.length >= 3 ? 30 : 10) +
      (s.textLen > 400 ? 20 : 5),
  );
  const overall = clamp(
    content * W.content +
      format * W.format +
      optimization * W.optimization +
      bestPractices * W.bestPractices +
      applicationReadiness * W.applicationReadiness,
  );
  return baseShell({
    resumeId: input.resumeId,
    mode,
    scoreName: mode === "job_match" ? "Application Readiness Score" : "Resume Optimization Score",
    scoreType: mode === "job_match" ? "job_match" : "resume_optimization",
    overall,
    engineId: "rezi_style",
    profileVersion: "1.1",
    scores: {
      resumeQuality: content,
      structureFormatting: format,
      keywordCoverage:
        mode === "job_match" && s.hardSkillsJd.length
          ? clamp(coverage(s.hardSkillsResume, s.hardSkillsJd) * 100)
          : null,
      atsCompatibility: format,
      evidenceQuality: bestPractices,
      experienceQuality: applicationReadiness,
    },
    strengths: [
      ...(format >= 70 ? ["Format/contact structure looks parser-friendly"] : []),
      ...(content >= 70 ? ["Content density with actions/metrics"] : []),
    ],
    improvements:
      optimization < 60 && mode === "job_match"
        ? [
            {
              priority: "high" as const,
              text: "Align experience bullets to JD tools you actually used — do not paste JD keywords without evidence.",
              reason: "Rezi optimization category (reference approximation).",
            },
          ]
        : [],
    atsIssues: [],
    resumeText: input.resumeText,
    notes: [
      `Five categories: content×${W.content} + format×${W.format} + optimization×${W.optimization} + bestPractices×${W.bestPractices} + applicationReadiness×${W.applicationReadiness}.`,
      "Approximation of documented Rezi categories — not the proprietary 23 audits.",
    ],
  });
}

/**
 * SkillSyncer-style documented 100-point allocation (highest-fidelity reference).
 * hard 60 + soft 15 + other 5 + title 10 + degree 10.
 * Frequency-aware keyword categories; empty JD category → full points;
 * title all-or-nothing on exact phrase; degree 10/5/0 or full 10 if JD has no degree.
 */
export function runSkillSyncerStyle(input: {
  resumeId: string;
  resumeText: string;
  role: string;
  jdText: string;
  mode?: AtsMode;
}): AtsAnalysis {
  const s = extractSignals(input.resumeText, input.jdText, input.role);
  const P = SKILLSYNCER_POINTS;
  const hard = frequencyCategoryPoints(
    s.hardSkillsJd,
    s.resumeLower,
    s.jdLower,
    P.hard,
    HARD_SKILL_ALIASES,
  );
  const soft = frequencyCategoryPoints(s.softSkillsJd, s.resumeLower, s.jdLower, P.soft);
  const other = frequencyCategoryPoints(s.jdTokens.slice(0, 40), s.resumeLower, s.jdLower, P.other);
  const titlePts = s.titleExact || (input.role.trim() && s.titleHit >= 1) ? P.title : 0;
  const degreePts = skillsyncerDegreePoints(s.degreeResume, s.degreeJd);
  const overall = clamp(hard.points + soft.points + other.points + titlePts + degreePts);
  const matchedSkills = hard.matched.map((skill) => ({
    skill,
    status: "matched" as const,
    strength: 0.9,
    evidence: "Frequency-aware hard-skill match",
  }));
  const missingSkills = hard.missing.map((skill) => ({
    skill,
    status: "missing" as const,
    strength: 0,
  }));
  return baseShell({
    resumeId: input.resumeId,
    mode: "job_match",
    scoreName: "Weighted Job Match Score",
    scoreType: "weighted_job_match",
    overall,
    engineId: "skillsyncer_style",
    profileVersion: "1.1",
    scores: {
      requiredSkills: clamp((hard.points / P.hard) * 100),
      preferredSkills: clamp((soft.points / P.soft) * 100),
      keywordCoverage: clamp((other.points / P.other) * 100),
      jobTitleMatch: titlePts === P.title ? 100 : 0,
      evidenceQuality: clamp(40 + s.actionBullets * 8),
    },
    strengths: [
      `Hard skills ${Math.round(hard.points)}/${P.hard}`,
      `Soft skills ${Math.round(soft.points)}/${P.soft}`,
      `Other keywords ${Math.round(other.points)}/${P.other}`,
      `Title ${titlePts}/${P.title}`,
      `Degree ${degreePts}/${P.degree}`,
    ],
    improvements: missingSkills.slice(0, 5).map((m) => ({
      priority: "high" as const,
      text: `${m.skill} is weighted heavily in this profile. Only add it if you have genuine experience.`,
      reason: "SkillSyncer hard-skill gap (60-point category).",
    })),
    atsIssues: [],
    matchedSkills,
    missingSkills,
    resumeText: input.resumeText,
    notes: [
      `Documented allocation: hard ${P.hard} · soft ${P.soft} · other ${P.other} · title ${P.title} · degree ${P.degree}.`,
      "Empty JD keyword category → full category points. Title is all-or-nothing on target phrase. Degree 10/5/0 (or 10 if JD has no degree).",
      `Sum check: ${Math.round(hard.points + soft.points + other.points + titlePts + degreePts)} (clamped to 0–100).`,
    ],
  });
}
