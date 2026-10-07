import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";

export type JobAnalysisRecord = {
  id: string;
  userId: string;
  rawText: string;
  summary: string | null;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  user_id: string;
  raw_text: string;
  summary: string | null;
  job_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): JobAnalysisRecord {
  return {
    id: row.id,
    userId: row.user_id,
    rawText: row.raw_text,
    summary: row.summary,
    jobId: row.job_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listJobAnalyses(userId: string): Promise<JobAnalysisRecord[]> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM job_analyses WHERE user_id = ${userId} ORDER BY created_at DESC
  `) as Row[];
  return rows.map(mapRow);
}

export async function createJobAnalysis(
  userId: string,
  input: { rawText: string; summary?: string | null; jobId?: string | null },
): Promise<JobAnalysisRecord> {
  await ensureAppSchema();
  const rawText = typeof input.rawText === "string" ? input.rawText.trim() : "";
  if (!rawText) throw new Error("Pasted JD text is required.");
  if (rawText.length > 100_000) throw new Error("JD text is too long.");

  const summary =
    input.summary?.trim() ||
    `Stub analysis (${rawText.split(/\s+/).length} words). Full JD parsing arrives later.`;

  const id = randomUUID();
  const now = new Date().toISOString();
  const jobId = input.jobId?.trim() || null;
  await getSql()`
    INSERT INTO job_analyses (id, user_id, raw_text, summary, job_id, created_at, updated_at)
    VALUES (${id}, ${userId}, ${rawText}, ${summary}, ${jobId}, ${now}, ${now})
  `;

  const rows = (await getSql()`
    SELECT * FROM job_analyses WHERE id = ${id} AND user_id = ${userId}
  `) as Row[];
  return mapRow(rows[0]);
}
