import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { ensureCompany } from "@/lib/companies";
import { getJob } from "@/lib/jobs";

export type CoverLetterStatus = "active" | "archived";

export type CoverLetterRecord = {
  id: string;
  userId: string;
  title: string;
  body: string;
  applicationId: string | null;
  jobId: string | null;
  companyName: string | null;
  roleTitle: string | null;
  status: CoverLetterStatus;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  application_id: string | null;
  job_id: string | null;
  company_name: string | null;
  role_title: string | null;
  status: CoverLetterStatus;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): CoverLetterRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    applicationId: row.application_id,
    jobId: row.job_id,
    companyName: row.company_name,
    roleTitle: row.role_title,
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

function optionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

export async function listCoverLetters(
  userId: string,
  opts?: { includeArchived?: boolean },
): Promise<CoverLetterRecord[]> {
  await ensureAppSchema();
  const includeArchived = opts?.includeArchived ?? false;
  const rows = includeArchived
    ? ((await getSql()`
        SELECT * FROM cover_letters WHERE user_id = ${userId} ORDER BY updated_at DESC
      `) as Row[])
    : ((await getSql()`
        SELECT * FROM cover_letters
        WHERE user_id = ${userId} AND status != 'archived'
        ORDER BY updated_at DESC
      `) as Row[]);
  return rows.map(mapRow);
}

export async function getCoverLetter(
  userId: string,
  id: string,
): Promise<CoverLetterRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM cover_letters WHERE id = ${id} AND user_id = ${userId}
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listCoverLettersForApplication(
  userId: string,
  applicationId: string,
): Promise<CoverLetterRecord[]> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM cover_letters
    WHERE user_id = ${userId} AND application_id = ${applicationId} AND status != 'archived'
    ORDER BY updated_at DESC
  `) as Row[];
  return rows.map(mapRow);
}

export async function createCoverLetter(
  userId: string,
  input: {
    title: string;
    body?: string;
    applicationId?: string | null;
    jobId?: string | null;
    companyName?: string | null;
    roleTitle?: string | null;
  },
): Promise<CoverLetterRecord> {
  await ensureAppSchema();
  const title = requireTitle(input.title);
  const body = typeof input.body === "string" ? input.body : "";
  let jobId = optionalId(input.jobId);
  let applicationId = optionalId(input.applicationId);
  let companyName = optionalId(input.companyName);
  let roleTitle = optionalId(input.roleTitle);

  if (jobId) {
    const job = await getJob(userId, jobId);
    if (!job) throw new Error("Job not found.");
    companyName = companyName || job.company;
    roleTitle = roleTitle || job.title;
    await ensureCompany(companyName);
  } else if (companyName && roleTitle) {
    await ensureCompany(companyName);
  } else if (applicationId) {
    // legacy path
  } else {
    throw new Error("Pick a job from Jobs, or enter a custom company and role.");
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  await getSql()`
    INSERT INTO cover_letters
      (id, user_id, title, body, application_id, job_id, company_name, role_title, status, created_at, updated_at)
    VALUES (
      ${id}, ${userId}, ${title}, ${body}, ${applicationId}, ${jobId}, ${companyName}, ${roleTitle},
      'active', ${now}, ${now}
    )
  `;
  const created = await getCoverLetter(userId, id);
  if (!created) throw new Error("Failed to create cover letter.");
  return created;
}

export async function updateCoverLetter(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    body: string;
    applicationId: string | null;
    jobId: string | null;
    companyName: string | null;
    roleTitle: string | null;
    status: CoverLetterStatus;
  }>,
): Promise<CoverLetterRecord> {
  await ensureAppSchema();
  const existing = await getCoverLetter(userId, id);
  if (!existing) throw new Error("Cover letter not found.");

  const title = patch.title !== undefined ? requireTitle(patch.title) : existing.title;
  const body = patch.body !== undefined ? patch.body : existing.body;
  let jobId = patch.jobId !== undefined ? optionalId(patch.jobId) : existing.jobId;
  let applicationId =
    patch.applicationId !== undefined ? optionalId(patch.applicationId) : existing.applicationId;
  let companyName =
    patch.companyName !== undefined ? optionalId(patch.companyName) : existing.companyName;
  let roleTitle = patch.roleTitle !== undefined ? optionalId(patch.roleTitle) : existing.roleTitle;

  if (jobId) {
    const job = await getJob(userId, jobId);
    if (!job) throw new Error("Job not found.");
    companyName = companyName || job.company;
    roleTitle = roleTitle || job.title;
  }

  if (!jobId && !(companyName && roleTitle) && !applicationId) {
    throw new Error("Cover letter needs a job or custom company + role.");
  }

  const status = patch.status ?? existing.status;
  if (status !== "active" && status !== "archived") throw new Error("Invalid status.");

  const now = new Date().toISOString();
  await getSql()`
    UPDATE cover_letters
    SET title = ${title}, body = ${body}, application_id = ${applicationId},
        job_id = ${jobId}, company_name = ${companyName}, role_title = ${roleTitle},
        status = ${status}, updated_at = ${now}
    WHERE id = ${id} AND user_id = ${userId}
  `;
  const updated = await getCoverLetter(userId, id);
  if (!updated) throw new Error("Cover letter not found after update.");
  return updated;
}

export async function archiveCoverLetter(userId: string, id: string): Promise<CoverLetterRecord> {
  return updateCoverLetter(userId, id, { status: "archived" });
}
