import "server-only";

import { randomUUID } from "node:crypto";

import { dbAll, dbGet, dbRun } from "@/lib/app-db";

export type CoverLetterStatus = "active" | "archived";

export type CoverLetterRecord = {
  id: string;
  userId: string;
  title: string;
  body: string;
  applicationId: string | null;
  companyName: string | null;
  role: string | null;
  jobId: string | null;
  status: CoverLetterStatus;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  user_id: string;
  title: string;
  body: string;
  application_id: string | null;
  company_name?: string | null;
  role?: string | null;
  job_id?: string | null;
  status: CoverLetterStatus;
  created_at: string;
  updated_at: string;
}): CoverLetterRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    applicationId: row.application_id,
    companyName: row.company_name ?? null,
    role: row.role ?? null,
    jobId: row.job_id ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireTitle(title: unknown): string {
  if (typeof title !== "string" || !title.trim()) throw new Error("Title is required.");
  const t = title.trim();
  if (t.length > 200) throw new Error("Title is too long.");
  return t;
}

export async function listCoverLetters(
  userId: string,
  opts?: { includeArchived?: boolean },
): Promise<CoverLetterRecord[]> {
  const includeArchived = opts?.includeArchived ?? false;
  const sql = includeArchived
    ? `SELECT * FROM cover_letters WHERE user_id = ? ORDER BY updated_at DESC`
    : `SELECT * FROM cover_letters WHERE user_id = ? AND status != 'archived' ORDER BY updated_at DESC`;
  const rows = (await dbAll(sql, userId)) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export async function getCoverLetter(
  userId: string,
  id: string,
): Promise<CoverLetterRecord | null> {
  const row = (await dbGet(
    `SELECT * FROM cover_letters WHERE id = ? AND user_id = ?`,
    id,
    userId,
  )) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

function optionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function createCoverLetter(
  userId: string,
  input: {
    title: string;
    body?: string;
    applicationId?: string | null;
    companyName?: string | null;
    role?: string | null;
    jobId?: string | null;
  },
): Promise<CoverLetterRecord> {
  const title = requireTitle(input.title);
  const body = typeof input.body === "string" ? input.body : "";
  const applicationId = optionalId(input.applicationId);
  const companyName = optionalId(input.companyName);
  const role = optionalId(input.role);
  const jobId = optionalId(input.jobId);
  if (!applicationId && !jobId && !(companyName && role)) {
    throw new Error("Link the cover letter to an application, a job, or a company and role.");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO cover_letters
        (id, user_id, title, body, application_id, company_name, role, job_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    id,
    userId,
    title,
    body,
    applicationId,
    companyName,
    role,
    jobId,
    now,
    now,
  );
  const created = await getCoverLetter(userId, id);
  if (!created) throw new Error("Could not save cover letter.");
  return created;
}

export async function updateCoverLetter(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    body: string;
    applicationId: string | null;
    companyName: string | null;
    role: string | null;
    jobId: string | null;
    status: CoverLetterStatus;
  }>,
): Promise<CoverLetterRecord> {
  const existing = await getCoverLetter(userId, id);
  if (!existing) throw new Error("Cover letter not found.");

  const title = patch.title !== undefined ? requireTitle(patch.title) : existing.title;
  const body = patch.body !== undefined ? patch.body : existing.body;
  const applicationId =
    patch.applicationId !== undefined
      ? patch.applicationId && patch.applicationId.trim()
        ? patch.applicationId.trim()
        : null
      : existing.applicationId;
  const companyName =
    patch.companyName !== undefined ? optionalId(patch.companyName) : existing.companyName;
  const role = patch.role !== undefined ? optionalId(patch.role) : existing.role;
  const jobId = patch.jobId !== undefined ? optionalId(patch.jobId) : existing.jobId;
  const status = patch.status ?? existing.status;
  if (status !== "active" && status !== "archived") throw new Error("Invalid status.");

  const now = new Date().toISOString();
  await dbRun(
    `UPDATE cover_letters
        SET title = ?, body = ?, application_id = ?, company_name = ?, role = ?, job_id = ?, status = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
    title,
    body,
    applicationId,
    companyName,
    role,
    jobId,
    status,
    now,
    id,
    userId,
  );
  const updated = await getCoverLetter(userId, id);
  if (!updated) throw new Error("Cover letter not found.");
  return updated;
}

export async function archiveCoverLetter(userId: string, id: string): Promise<CoverLetterRecord> {
  return updateCoverLetter(userId, id, { status: "archived" });
}
