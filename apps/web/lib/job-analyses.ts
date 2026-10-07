import { randomUUID } from "node:crypto";

import { getAppDb } from "@/lib/app-db";

export type JobAnalysisRecord = {
  id: string;
  userId: string;
  rawText: string;
  summary: string | null;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  user_id: string;
  raw_text: string;
  summary: string | null;
  job_id: string | null;
  created_at: string;
  updated_at: string;
}): JobAnalysisRecord {
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

export function listJobAnalyses(userId: string): JobAnalysisRecord[] {
  const rows = getAppDb()
    .prepare(`SELECT * FROM job_analyses WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export function createJobAnalysis(
  userId: string,
  input: { rawText: string; summary?: string | null; jobId?: string | null },
): JobAnalysisRecord {
  const rawText = typeof input.rawText === "string" ? input.rawText.trim() : "";
  if (!rawText) throw new Error("Pasted JD text is required.");
  if (rawText.length > 100_000) throw new Error("JD text is too long.");

  // Local stub summary — no global Job creation.
  const summary =
    input.summary?.trim() ||
    `Stub analysis (${rawText.split(/\s+/).length} words). Full JD parsing arrives later.`;

  const id = randomUUID();
  const now = new Date().toISOString();
  const jobId = input.jobId?.trim() || null;
  getAppDb()
    .prepare(
      `INSERT INTO job_analyses (id, user_id, raw_text, summary, job_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, userId, rawText, summary, jobId, now, now);

  const row = getAppDb()
    .prepare(`SELECT * FROM job_analyses WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Parameters<typeof mapRow>[0];
  return mapRow(row);
}
