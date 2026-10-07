import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import type { CareerProfile } from "@/lib/career-profile";
import { getJobById, listJobsForUser, type JobRecord } from "@/lib/jobs";
import { getProfile } from "@/lib/profile";
import { getActiveResume, listResumes } from "@/lib/resumes";

export type JobScoreRecord = {
  id: string;
  userId: string;
  jobId: string;
  resumeId: string | null;
  compatibilityScore: number;
  atsScore: number;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  user_id: string;
  job_id: string;
  resume_id: string | null;
  compatibility_score: number;
  ats_score: number;
  details_json: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): JobScoreRecord {
  let details: Record<string, unknown> = {};
  try {
    details = JSON.parse(row.details_json || "{}") as Record<string, unknown>;
  } catch {
    details = {};
  }
  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    resumeId: row.resume_id,
    compatibilityScore: Number(row.compatibility_score) || 0,
    atsScore: Number(row.ats_score) || 0,
    details,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const STOP = new Set([
  "a","an","the","and","or","to","of","in","on","for","with","at","by","from","as",
  "is","are","be","this","that","it","you","your","we","our","will","can","have",
  "has","was","were","been","their","they","them","not","but","if","into","over",
  "per","via","etc","such","using","use","used","work","working","role","job",
  "team","years","year","experience","including","ability","strong","good",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/[\s,/|;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function unique(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Built-in ATS score: JD structure + keyword density for parsing. */
export function computeAtsScore(job: {
  title: string;
  company: string;
  location: string;
  description: string;
  salary?: string | null;
  url?: string | null;
}): { score: number; details: Record<string, unknown> } {
  const desc = job.description || "";
  const words = desc.trim().split(/\s+/).filter(Boolean).length;
  let score = 20;
  const checks: Record<string, boolean> = {
    hasTitle: Boolean(job.title?.trim()),
    hasCompany: Boolean(job.company?.trim()),
    hasLocation: Boolean(job.location?.trim()),
    hasUrl: Boolean(job.url?.trim()),
    hasSalary: Boolean(job.salary?.trim()),
    hasDescription: words >= 40,
    hasRequirements: /requirement|qualification|must have|you.?ll need|skills?:/i.test(desc),
    hasResponsibilities:
      /responsibilit|what you.?ll do|you will|day.?to.?day|about the role/i.test(desc),
    hasBulletOrLines: /(?:^|\n)\s*[•\-*●]|\n{2,}/.test(desc),
    enoughLength: words >= 80,
  };

  const weights: Array<[string, number]> = [
    ["hasTitle", 8],
    ["hasCompany", 6],
    ["hasLocation", 4],
    ["hasUrl", 4],
    ["hasSalary", 4],
    ["hasDescription", 12],
    ["hasRequirements", 16],
    ["hasResponsibilities", 12],
    ["hasBulletOrLines", 8],
    ["enoughLength", 10],
  ];
  for (const [key, w] of weights) {
    if (checks[key]) score += w;
  }

  const tokens = unique(tokenize(desc));
  if (tokens.length >= 40) score += 8;
  else if (tokens.length >= 20) score += 4;

  return {
    score: clampScore(score),
    details: { checks, wordCount: words, uniqueTokens: tokens.length },
  };
}

/** Compatibility: career profile + resume text vs JD. */
export function computeCompatibilityScore(input: {
  job: {
    title: string;
    company: string;
    location: string;
    description: string;
    salary?: string | null;
  };
  career: CareerProfile | null;
  resumeText: string;
}): { score: number; details: Record<string, unknown> } {
  const jd = `${input.job.title}\n${input.job.company}\n${input.job.location}\n${input.job.description}\n${input.job.salary ?? ""}`;
  const jdTokens = new Set(tokenize(jd));
  const career = input.career;

  const skillHits: string[] = [];
  const roleHits: string[] = [];
  const locationHits: string[] = [];

  const skills = career?.skills ?? [];
  for (const skill of skills) {
    const parts = tokenize(skill);
    if (parts.some((p) => jdTokens.has(p)) || jd.toLowerCase().includes(skill.toLowerCase())) {
      skillHits.push(skill);
    }
  }

  for (const role of career?.preferredRoles ?? []) {
    const parts = tokenize(role);
    if (
      parts.some((p) => jdTokens.has(p)) ||
      input.job.title.toLowerCase().includes(role.toLowerCase())
    ) {
      roleHits.push(role);
    }
  }

  for (const loc of career?.preferredLocations ?? []) {
    if (
      input.job.location.toLowerCase().includes(loc.toLowerCase()) ||
      loc.toLowerCase() === "remote"
    ) {
      locationHits.push(loc);
    }
  }
  if (career?.remotePreference === "remote" && /remote/i.test(input.job.location)) {
    locationHits.push("remote");
  }

  const resumeTokens = unique(tokenize(input.resumeText));
  const resumeOverlap = resumeTokens.filter((t) => jdTokens.has(t));

  let score = 12;
  const skillRatio = skills.length ? skillHits.length / skills.length : 0;
  score += skillRatio * 38;
  score += Math.min(18, roleHits.length * 9);
  score += Math.min(12, locationHits.length * 6);

  if (resumeTokens.length > 0) {
    const overlapRatio = resumeOverlap.length / Math.max(12, Math.min(resumeTokens.length, 80));
    score += Math.min(28, overlapRatio * 40);
  } else if (skills.length === 0) {
    const titleTokens = tokenize(input.job.title);
    const soft = titleTokens.filter((t) => jdTokens.has(t)).length;
    score += Math.min(10, soft * 2);
  }

  if (career?.experienceLevel) {
    const yearsMatch = /(\d+)\+?\s*\+?\s*years?/i.exec(input.job.description);
    if (yearsMatch) {
      const needed = Number(yearsMatch[1]);
      const map: Record<string, number> = {
        "0-1": 1,
        "1-3": 2,
        "3-5": 4,
        "5-8": 6,
        "8+": 9,
      };
      const have = map[career.experienceLevel] ?? 0;
      if (have >= needed) score += 8;
      else if (have >= needed - 1) score += 4;
    }
  }

  return {
    score: clampScore(score),
    details: {
      skillHits,
      roleHits,
      locationHits,
      resumeOverlapCount: resumeOverlap.length,
      resumeTokenCount: resumeTokens.length,
    },
  };
}

export async function getJobScore(userId: string, jobId: string): Promise<JobScoreRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM job_scores WHERE user_id = ${userId} AND job_id = ${jobId} LIMIT 1
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listJobScores(userId: string): Promise<JobScoreRecord[]> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM job_scores WHERE user_id = ${userId}
  `) as Row[];
  return rows.map(mapRow);
}

export async function upsertJobScore(
  userId: string,
  jobId: string,
  input: {
    resumeId: string | null;
    compatibilityScore: number;
    atsScore: number;
    details: Record<string, unknown>;
  },
): Promise<JobScoreRecord> {
  await ensureAppSchema();
  const now = new Date().toISOString();
  const existing = await getJobScore(userId, jobId);
  const detailsJson = JSON.stringify(input.details ?? {});
  if (existing) {
    await getSql()`
      UPDATE job_scores SET
        resume_id = ${input.resumeId},
        compatibility_score = ${input.compatibilityScore},
        ats_score = ${input.atsScore},
        details_json = ${detailsJson},
        updated_at = ${now}
      WHERE id = ${existing.id}
    `;
    const updated = await getJobScore(userId, jobId);
    if (!updated) throw new Error("Score update failed.");
    return updated;
  }
  const id = randomUUID();
  await getSql()`
    INSERT INTO job_scores
      (id, user_id, job_id, resume_id, compatibility_score, ats_score, details_json, created_at, updated_at)
    VALUES (
      ${id}, ${userId}, ${jobId}, ${input.resumeId}, ${input.compatibilityScore},
      ${input.atsScore}, ${detailsJson}, ${now}, ${now}
    )
  `;
  const created = await getJobScore(userId, jobId);
  if (!created) throw new Error("Score create failed.");
  return created;
}

async function resumeTextForUser(
  userId: string,
): Promise<{ text: string; resumeId: string | null }> {
  const active = await getActiveResume(userId);
  const resumes = active ? [active] : await listResumes(userId);
  const resume = resumes[0] ?? null;
  if (!resume) return { text: "", resumeId: null };
  const rows = (await getSql()`
    SELECT extracted_text FROM resumes WHERE id = ${resume.id} AND user_id = ${userId}
  `) as Array<{ extracted_text: string | null }>;
  const extracted = rows[0]?.extracted_text?.trim() ?? "";
  return { text: extracted, resumeId: resume.id };
}

export async function scoreJobForUser(userId: string, job: JobRecord): Promise<JobScoreRecord> {
  const profile = await getProfile(userId);
  const career = profile?.career ?? null;
  const { text: resumeText, resumeId } = await resumeTextForUser(userId);
  const blended =
    resumeText ||
    [career?.skills?.join(" "), career?.preferredRoles?.join(" "), career?.industryPreference]
      .filter(Boolean)
      .join("\n");

  const ats = computeAtsScore(job);
  const compat = computeCompatibilityScore({ job, career, resumeText: blended });

  return upsertJobScore(userId, job.id, {
    resumeId,
    compatibilityScore: compat.score,
    atsScore: ats.score,
    details: { ats: ats.details, compatibility: compat.details },
  });
}

export async function rescoreAllJobsForUser(userId: string): Promise<number> {
  const jobs = await listJobsForUser(userId, { includeIgnored: true });
  let n = 0;
  for (const job of jobs) {
    if (job.status === "archived") continue;
    await scoreJobForUser(userId, job);
    n += 1;
  }
  return n;
}

export async function rescoreJobForAllUsers(jobId: string): Promise<void> {
  await ensureAppSchema();
  const job = await getJobById(jobId);
  if (!job) return;
  const users = (await getSql()`
    SELECT user_id FROM profiles
  `) as Array<{ user_id: string }>;
  for (const row of users) {
    await scoreJobForUser(row.user_id, job);
  }
}
