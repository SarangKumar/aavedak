/**
 * Local fallback when the Python ATS API is unreachable.
 * Continuous, resume-specific signals — avoids identical scores across different PDFs.
 */
import "server-only";

import {
  detectAtsMode,
  fingerprintText,
  scoreBandLabel,
  type AtsAnalysis,
  type AtsImprovement,
  type AtsIssue,
  type AtsSkillHit,
} from "@/lib/ats-types";

function issue(code: string, title: string, detail: string): AtsIssue {
  return { code, title, detail };
}

/** Unambiguous aliases only — avoid short forms like js/ts/go/node that false-positive. */
const ALIASES: Record<string, string[]> = {
  react: ["react", "react.js", "reactjs"],
  nextjs: ["next.js", "nextjs"],
  typescript: ["typescript"],
  javascript: ["javascript", "ecmascript"],
  nodejs: ["node.js", "nodejs"],
  python: ["python"],
  postgresql: ["postgresql", "postgres"],
  mysql: ["mysql"],
  aws: ["aws", "amazon web services"],
  gcp: ["gcp", "google cloud"],
  azure: ["azure"],
  docker: ["docker"],
  kubernetes: ["kubernetes", "k8s"],
  rest: ["rest api", "restful", "rest apis"],
  sql: ["sql"],
  fastapi: ["fastapi"],
  django: ["django"],
  graphql: ["graphql"],
  redux: ["redux"],
  tailwind: ["tailwind"],
  html: ["html"],
  css: ["css"],
  git: ["github", "gitlab", "git"],
  terraform: ["terraform"],
  linux: ["linux"],
  redis: ["redis"],
  kafka: ["kafka"],
  spark: ["spark", "pyspark", "apache spark"],
  airflow: ["airflow", "apache airflow"],
  snowflake: ["snowflake"],
  bigquery: ["bigquery", "big query"],
  dbt: ["dbt"],
  iceberg: ["iceberg", "apache iceberg"],
  delta_lake: ["delta lake", "deltalake"],
  duckdb: ["duckdb"],
  trino: ["trino", "presto"],
  databricks: ["databricks"],
  etl: ["etl", "elt", "data pipeline"],
};

const SKILL_CATEGORIES: string[][] = [
  ["react", "nextjs", "typescript", "javascript", "css", "html", "redux"],
  ["nodejs", "python", "fastapi", "django", "rest", "graphql"],
  ["postgresql", "mysql", "redis", "sql"],
  ["aws", "gcp", "azure", "docker", "kubernetes", "terraform", "linux"],
  ["spark", "airflow", "kafka", "snowflake", "dbt", "bigquery", "etl", "iceberg", "databricks"],
];

/** Role → weighted skill expectations (core gets more weight). */
const ROLE_WEIGHTS: Record<string, Array<{ id: string; w: number }>> = {
  "software engineer": [
    { id: "typescript", w: 3 },
    { id: "javascript", w: 2 },
    { id: "sql", w: 2 },
    { id: "react", w: 2 },
    { id: "nodejs", w: 2 },
    { id: "git", w: 1 },
    { id: "rest", w: 2 },
    { id: "docker", w: 1 },
  ],
  "frontend engineer": [
    { id: "react", w: 3 },
    { id: "typescript", w: 3 },
    { id: "javascript", w: 2 },
    { id: "nextjs", w: 3 },
    { id: "css", w: 2 },
    { id: "html", w: 2 },
    { id: "redux", w: 1 },
    { id: "tailwind", w: 1 },
  ],
  "backend engineer": [
    { id: "nodejs", w: 3 },
    { id: "python", w: 3 },
    { id: "sql", w: 3 },
    { id: "postgresql", w: 2 },
    { id: "rest", w: 3 },
    { id: "docker", w: 1 },
    { id: "redis", w: 1 },
    { id: "fastapi", w: 1 },
  ],
  "cloud engineer": [
    { id: "aws", w: 3 },
    { id: "docker", w: 3 },
    { id: "kubernetes", w: 3 },
    { id: "linux", w: 2 },
    { id: "terraform", w: 2 },
    { id: "python", w: 1 },
  ],
  "full stack": [
    { id: "react", w: 3 },
    { id: "typescript", w: 3 },
    { id: "nodejs", w: 3 },
    { id: "sql", w: 2 },
    { id: "nextjs", w: 2 },
    { id: "postgresql", w: 1 },
  ],
  "data engineer": [
    { id: "python", w: 3 },
    { id: "sql", w: 3 },
    { id: "spark", w: 3 },
    { id: "airflow", w: 3 },
    { id: "kafka", w: 2 },
    { id: "snowflake", w: 2 },
    { id: "dbt", w: 2 },
    { id: "bigquery", w: 2 },
    { id: "aws", w: 1 },
    { id: "iceberg", w: 1 },
    { id: "etl", w: 1 },
  ],
};

const FRONTEND_MARKERS = [
  "frontend",
  "front-end",
  "ui ",
  "ux",
  "css",
  "component",
  "react",
  "next",
  "figma",
  "tailwind",
  "responsive",
];
const BACKEND_MARKERS = [
  "backend",
  "back-end",
  "api",
  "postgres",
  "database",
  "microservice",
  "queue",
  "server",
  "fastapi",
  "django",
];
const CLOUD_MARKERS = ["aws", "gcp", "azure", "kubernetes", "terraform", "devops", "infra"];
const DATA_MARKERS = [
  "data engineer",
  "data platform",
  "pyspark",
  "spark",
  "airflow",
  "kafka",
  "snowflake",
  "bigquery",
  "dbt",
  "iceberg",
  "delta lake",
  "duckdb",
  "etl",
  "lakehouse",
  "data lake",
  "pipeline",
  "ingestion",
];

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Soft cap so checklist resumes don't all land on 100. */
function softCap(n: number, softMax = 92): number {
  if (n <= softMax) return clamp(n);
  return clamp(softMax + (n - softMax) * 0.25);
}

function findSkills(text: string): Map<string, { count: number; inExp: boolean }> {
  const lower = text.toLowerCase();
  const map = new Map<string, { count: number; inExp: boolean }>();
  const expIdx = (() => {
    const i = lower.search(/\n\s*(experience|work experience|employment)\b/);
    return i >= 0 ? i : Math.floor(lower.length * 0.15);
  })();
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    let count = 0;
    let inExp = false;
    for (const alias of aliases) {
      let idx = 0;
      while (true) {
        const at = lower.indexOf(alias, idx);
        if (at < 0) break;
        // word-ish boundary
        const before = at === 0 ? " " : lower[at - 1]!;
        const after = lower[at + alias.length] ?? " ";
        if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) {
          idx = at + alias.length;
          continue;
        }
        count += 1;
        if (at >= expIdx) inExp = true;
        idx = at + alias.length;
      }
    }
    if (count > 0) map.set(canonical, { count, inExp });
  }
  return map;
}

function uniqueTokens(text: string): string[] {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "your",
    "have",
    "were",
    "been",
    "will",
    "into",
    "using",
    "used",
    "work",
    "team",
    "role",
    "years",
    "year",
    "experience",
  ]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of text.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) ?? []) {
    if (stop.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function markerScore(lower: string, markers: string[]): number {
  let hits = 0;
  for (const m of markers) if (lower.includes(m)) hits += 1;
  return hits / markers.length;
}

function resolveRoleKey(title: string): string {
  const t = title
    .toLowerCase()
    .replace(/enginner/g, "engineer")
    .replace(/enginering/g, "engineering");
  if (
    t.includes("data") &&
    (t.includes("engin") || t.includes("platform") || t.includes("pipeline"))
  ) {
    return "data engineer";
  }
  if (t.includes("front")) return "frontend engineer";
  if (t.includes("back")) return "backend engineer";
  if (t.includes("cloud") || t.includes("devops") || t.includes("sre")) return "cloud engineer";
  if (t.includes("full")) return "full stack";
  if (t.includes("design")) return "frontend engineer";
  if (t.includes("data")) return "data engineer";
  const keys = Object.keys(ROLE_WEIGHTS);
  for (const k of keys) if (t.includes(k)) return k;
  return "software engineer";
}

function scoreName(mode: AtsAnalysis["mode"]) {
  if (mode === "resume_only") return "Resume Quality Score";
  if (mode === "role_match") return "Role Match Score";
  return "ATS Match Score";
}

function skillStrength(hit: { count: number; inExp: boolean } | undefined): {
  strength: number;
  status: AtsSkillHit["status"];
  matchType: string;
} {
  if (!hit) return { strength: 0, status: "missing", matchType: "missing" };
  if (hit.inExp && hit.count <= 4)
    return { strength: 1, status: "matched", matchType: "exact_strong" };
  if (hit.inExp) return { strength: 0.9, status: "matched", matchType: "exact_strong" };
  // Skills-list only — partial credit, never a full match
  if (hit.count >= 5) return { strength: 0.25, status: "partial", matchType: "stuffed" };
  if (hit.count === 1) return { strength: 0.45, status: "partial", matchType: "exact_weak" };
  if (hit.count <= 3) return { strength: 0.35, status: "partial", matchType: "exact_weak" };
  return { strength: 0.3, status: "partial", matchType: "exact_weak" };
}

function skillSetSignal(skillIds: string[], inExp: number): number {
  if (skillIds.length === 0) return 15;
  const idSet = new Set(skillIds);
  const categories = SKILL_CATEGORIES.filter((cat) => cat.some((id) => idSet.has(id))).length;
  const breadth = Math.min(40, categories * 8);
  const depth = Math.min(35, inExp * 5);
  const volume = Math.min(25, skillIds.length * 2.5);
  if (inExp === 0) return Math.min(55, breadth * 0.6 + volume * 0.5);
  return Math.min(100, breadth + depth + volume);
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
  const tokens = uniqueTokens(text);
  const fp = fingerprintText(text);

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
      atsIssues: [
        issue(
          "empty_resume",
          "Empty or unreadable resume text",
          "No extractable text was available for this file. Re-upload a text-based PDF (selectable text), or paste the resume content if the PDF is scanned.",
        ),
      ],
      confidence: "low",
      error: "Could not extract readable text from this PDF.",
      engine: "fallback",
      textChars: 0,
      textFingerprint: "empty",
    };
  }

  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 24);
  const actionRe =
    /^(built|developed|designed|implemented|led|owned|created|optimized|improved|reduced|increased|launched|shipped|architected|migrated|automated|debugged|scaled|delivered)\b/i;
  const actionBullets = lines.filter((l) => actionRe.test(l)).length;
  const metricHits = (text.match(/\d+(?:\.\d+)?%|\d+[kKmMbB]\+?|\bp\d{2}\b|\d{2,}\+/g) || [])
    .length;
  const sections = ["experience", "education", "skills", "projects", "summary"].filter((s) =>
    new RegExp(`(?:^|\\n)\\s*${s}\\b`, "i").test(text),
  );

  let stuffing = 0;
  for (const s of skills.values()) if (s.count >= 5) stuffing += 1;

  // —— ATS compatibility (continuous, harder to max) ——
  let ats = 8;
  const atsIssues: AtsIssue[] = [];
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
  const hasPhone = /\+?\d[\d\s().-]{7,}\d/.test(text);
  ats += Math.min(16, text.length / 120); // length continuum
  if (text.trim().length < 400) {
    atsIssues.push(
      issue(
        "sparse_text",
        "Too little readable text extracted",
        `Only about ${text.trim().length} characters came out of this file. Many ATS systems cannot read scanned/image-only PDFs or text locked in graphics. Export a text-based PDF with selectable body text.`,
      ),
    );
  }
  if (hasEmail) ats += 10;
  else
    atsIssues.push(
      issue(
        "missing_email",
        "No plain-text email address found",
        "Parsers look for a normal address like name@domain.com in the header. Emails drawn as icons or image text are often skipped.",
      ),
    );
  if (hasPhone) ats += 7;
  else
    atsIssues.push(
      issue(
        "missing_phone",
        "No plain-text phone number found",
        "Include a phone number as normal digits (with optional country code), not as an icon or image.",
      ),
    );
  ats += Math.min(20, sections.length * 4.5);
  if (sections.length < 3) {
    const missing = ["experience", "education", "skills"].filter((s) => !sections.includes(s));
    atsIssues.push(
      issue(
        sections.length === 0 ? "no_sections" : "incomplete_sections",
        sections.length === 0
          ? "No standard section headings detected"
          : `Missing clear section(s): ${missing.join(", ") || "core sections"}`,
        "Standard labeled sections (Experience, Education, Skills) help ATS systems map content correctly. Use those words as line headings, not only in a design sidebar.",
      ),
    );
  }
  if (lower.includes("linkedin")) ats += 4;
  else if (hasEmail) {
    atsIssues.push(
      issue(
        "missing_linkedin",
        "LinkedIn URL not detected",
        "Add your LinkedIn profile as plain text (linkedin.com/in/…) in the header so recruiters can verify identity.",
      ),
    );
  }
  if (lower.includes("github")) ats += 4;
  ats += Math.min(12, skills.size * 1.2);
  if (skills.size < 3) {
    atsIssues.push(
      issue(
        "few_skills",
        "Very few recognizable tools/skills in plain text",
        `Only ${skills.size} known skill(s) were found. Write tool names as normal words (e.g. React, PostgreSQL)—not logos or skill bars.`,
      ),
    );
  }
  ats += Math.min(8, tokens.length / 40);
  if (stuffing) {
    ats -= stuffing * 6;
    atsIssues.push(
      issue(
        "keyword_stuffing",
        "Keyword repetition / stuffing detected",
        "The same tools appear many times with little experience context. List each skill once in Skills, then prove it in Experience bullets with an action and outcome.",
      ),
    );
  }
  ats = softCap(ats, 90);

  // —— Resume quality ——
  let quality = 18;
  quality += Math.min(22, actionBullets * 3.2);
  quality += Math.min(22, metricHits * 4);
  quality += Math.min(12, sections.length * 3);
  quality += Math.min(10, tokens.length / 35);
  quality += Math.min(8, lines.length / 8);
  // Penalize very short / very repetitive
  if (text.length < 800) quality -= 8;
  if (stuffing) quality -= stuffing * 5;
  quality = softCap(quality, 88);

  const inExp = [...skills.values()].filter((s) => s.inExp).length;
  const skillIds = [...skills.keys()].sort();
  const skillSignal = skillSetSignal(skillIds, inExp);
  const tech = softCap(skills.size * 6 + inExp * 4 + skillSignal * 0.35, 90);
  const expQuality = softCap(
    22 + actionBullets * 3.5 + metricHits * 4.5 + (inExp > 0 ? 8 : 0) + Math.min(14, lines.length),
    90,
  );

  const fe = markerScore(lower, FRONTEND_MARKERS);
  const be = markerScore(lower, BACKEND_MARKERS);
  const cloud = markerScore(lower, CLOUD_MARKERS);
  const dataFlavor = markerScore(lower, DATA_MARKERS);

  const strengths: string[] = [];
  const improvements: AtsImprovement[] = [];
  if (metricHits >= 2) strengths.push(`${metricHits} measurable impact signals`);
  else
    improvements.push({
      priority: "high",
      text: "Add measurable results to 2–3 experience bullets.",
      reason: "Few quantified outcomes detected.",
    });
  if (actionBullets >= 3) strengths.push(`${actionBullets} action-led bullets`);
  if (inExp >= 3) strengths.push(`${inExp} skills evidenced in experience`);
  if (fe > be && fe > 0.25) strengths.push("Frontend-leaning skill profile");
  if (be > fe && be > 0.25) strengths.push("Backend-leaning skill profile");

  const scores: AtsAnalysis["scores"] = {
    atsCompatibility: clamp(ats),
    resumeQuality: clamp(quality),
    technicalSkills: clamp(tech),
    experienceQuality: clamp(expQuality),
    structureFormatting: clamp(ats * 0.85 + sections.length * 3),
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

  let overall = 0;

  if (mode === "resume_only") {
    scores.evidenceQuality = softCap(
      quality * 0.5 + (inExp / Math.max(1, skills.size)) * 45 + (stuffing ? 0 : 8),
      90,
    );
    overall = softCap(
      ats * 0.18 +
        quality * 0.26 +
        tech * 0.16 +
        expQuality * 0.22 +
        (scores.evidenceQuality || 0) * 0.12 +
        skillSignal * 0.06,
      93,
    );
  } else {
    const title =
      role ||
      jd
        .split("\n")
        .find((l) => l.trim())
        ?.trim() ||
      "";
    const roleKey = resolveRoleKey(title);
    const weighted = ROLE_WEIGHTS[roleKey] || ROLE_WEIGHTS["software engineer"]!;

    // Prefer JD-extracted skills when present
    const jdSkills = jd ? findSkills(jd) : new Map();
    const reqList: Array<{ id: string; w: number }> = jdSkills.size
      ? [...jdSkills.keys()].slice(0, 14).map((id) => ({ id, w: 2 }))
      : weighted;

    let weightedSum = 0;
    let weightTotal = 0;
    let missingCount = 0;
    for (const { id, w } of reqList) {
      weightTotal += w;
      const hit = skills.get(id);
      const { strength, status, matchType } = skillStrength(hit);
      weightedSum += strength * w;
      if (strength < 0.3) missingCount += 1;
      const entry: AtsSkillHit = {
        skill: id,
        status,
        matchType,
        strength,
        evidence: hit?.inExp
          ? `Found in experience context (${hit.count}×)`
          : hit
            ? `Listed ${hit.count}× (skills-only)`
            : undefined,
      };
      if (status === "matched") matchedSkills.push(entry);
      else if (status === "partial") partialSkills.push(entry);
      else {
        missingSkills.push(entry);
        improvements.push({
          priority: w >= 3 ? "high" : "medium",
          text: `If you have experience with ${id}, make it explicit in an experience bullet — do not invent it.`,
          reason: `${id} is expected for ${roleKey} but not evidenced on this resume.`,
        });
      }
    }

    const missingRatio = missingCount / Math.max(1, reqList.length);
    const reqScore = softCap(
      (weightedSum / Math.max(1, weightTotal)) * 100 * (1 - 0.22 * missingRatio),
      95,
    );
    scores.requiredSkills = reqScore;

    // Role flavor alignment: title vs language markers on THIS resume
    let flavor = 50;
    if (roleKey === "frontend engineer") flavor = 35 + fe * 55 + (1 - be) * 10;
    else if (roleKey === "data engineer") flavor = 22 + dataFlavor * 65 + be * 8 + (1 - fe) * 5;
    else if (roleKey === "backend engineer") flavor = 35 + be * 55 + (1 - fe) * 10;
    else if (roleKey === "cloud engineer") flavor = 35 + cloud * 55;
    else if (roleKey === "full stack") flavor = 40 + ((fe + be) / 2) * 50;
    else flavor = 40 + ((fe + be) / 2) * 40 + cloud * 10;
    scores.experienceMatch = softCap(flavor * 0.55 + expQuality * 0.45, 93);

    // Title match against resume text + flavor
    const titleTok = title
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length > 2);
    const titleHits = titleTok.filter((t) => lower.includes(t)).length;
    const titleBase = titleTok.length ? (titleHits / titleTok.length) * 70 : 40;
    scores.jobTitleMatch = softCap(titleBase + flavor * 0.25, 95);

    scores.evidenceQuality = softCap(
      (inExp / Math.max(1, skills.size)) * 55 +
        (metricHits > 0 ? 15 : 0) +
        (actionBullets > 2 ? 15 : 0) +
        (stuffing ? -20 : 10),
      92,
    );

    // Keyword / token coverage vs JD or role skill names
    const targetTokens = new Set<string>();
    if (jd) {
      for (const t of uniqueTokens(jd)) targetTokens.add(t);
    } else {
      for (const { id } of weighted) targetTokens.add(id);
    }
    const resumeSet = new Set(tokens);
    let covHits = 0;
    for (const t of targetTokens) if (resumeSet.has(t)) covHits += 1;
    const coverage = targetTokens.size ? covHits / targetTokens.size : 0;
    scores.keywordCoverage = softCap(coverage * 100, 94);

    if (jdSkills.size) {
      // preferred = skills in resume beyond required that appear in JD body loosely
      scores.preferredSkills = softCap(coverage * 80 + inExp * 3, 90);
    }

    overall = softCap(
      (scores.requiredSkills || 0) * 0.3 +
        (scores.experienceMatch || 0) * 0.18 +
        (scores.evidenceQuality || 0) * 0.14 +
        (scores.jobTitleMatch || 0) * 0.1 +
        (scores.keywordCoverage || 0) * 0.08 +
        ats * 0.08 +
        quality * 0.08 +
        skillSignal * 0.04,
      93,
    );
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
    confidence: text.length > 900 ? "high" : text.length > 400 ? "medium" : "low",
    blurb:
      "Calculated from ATS compatibility, skills, experience, responsibilities, keywords, and evidence — unique to this resume’s extracted text.",
    engine: "fallback",
    atsScore: overall,
    textChars: text.trim().length,
    textFingerprint: fp,
    notes: [
      ...(jd && jd.split(/\s+/).length < 40
        ? [
            "Not enough job-description information for a reliable job match. Showing role/resume-weighted analysis.",
          ]
        : []),
      `Extracted ${text.trim().length} chars · ${tokens.length} unique tokens · ${skills.size} skills`,
    ],
  };
}
