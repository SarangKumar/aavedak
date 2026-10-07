import "server-only";

import { randomUUID } from "node:crypto";

import { dbAll, dbGet, dbRun } from "@/lib/app-db";

export type JobAnalysisRecord = {
  id: string;
  userId: string;
  rawText: string;
  summary: string | null;
  jobId: string | null;
  companyName: string | null;
  role: string | null;
  atsScore: number | null;
  resumeMatchScore: number | null;
  coverLetterId: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  user_id: string;
  raw_text: string;
  summary: string | null;
  job_id: string | null;
  company_name?: string | null;
  role_title?: string | null;
  ats_score?: number | string | null;
  resume_match_score?: number | string | null;
  cover_letter_id?: string | null;
  created_at: string;
  updated_at: string;
}): JobAnalysisRecord {
  return {
    id: row.id,
    userId: row.user_id,
    rawText: row.raw_text,
    summary: row.summary,
    jobId: row.job_id,
    companyName: row.company_name ?? null,
    role: row.role_title ?? null,
    atsScore: row.ats_score == null || row.ats_score === "" ? null : Number(row.ats_score),
    resumeMatchScore:
      row.resume_match_score == null || row.resume_match_score === ""
        ? null
        : Number(row.resume_match_score),
    coverLetterId: row.cover_letter_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listJobAnalyses(userId: string): Promise<JobAnalysisRecord[]> {
  const rows = (await dbAll(
    `SELECT * FROM job_analyses WHERE user_id = ? ORDER BY created_at DESC`,
    userId,
  )) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export async function createJobAnalysis(
  userId: string,
  input: {
    rawText: string;
    summary?: string | null;
    jobId?: string | null;
    companyName?: string | null;
    role?: string | null;
    atsScore?: number | null;
    resumeMatchScore?: number | null;
    coverLetterId?: string | null;
  },
): Promise<JobAnalysisRecord> {
  const rawText = typeof input.rawText === "string" ? input.rawText.trim() : "";
  if (!rawText) throw new Error("Pasted JD text is required.");
  if (rawText.length > 100_000) throw new Error("JD text is too long.");

  const summary =
    input.summary?.trim() ||
    `Keyword match (${rawText.split(/\s+/).filter(Boolean).length} words).`;

  const id = randomUUID();
  const now = new Date().toISOString();
  const jobId = input.jobId?.trim() || null;
  await dbRun(
    `INSERT INTO job_analyses
        (id, user_id, raw_text, summary, job_id, company_name, role_title, ats_score, resume_match_score, cover_letter_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    rawText,
    summary,
    jobId,
    input.companyName?.trim() || null,
    input.role?.trim() || null,
    input.atsScore ?? null,
    input.resumeMatchScore ?? null,
    input.coverLetterId?.trim() || null,
    now,
    now,
  );

  const row = (await dbGet(
    `SELECT * FROM job_analyses WHERE id = ? AND user_id = ?`,
    id,
    userId,
  )) as Parameters<typeof mapRow>[0];
  return mapRow(row);
}
