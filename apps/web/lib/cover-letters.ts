import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";

export type CoverLetterStatus = "active" | "archived";

export type CoverLetterRecord = {
  id: string;
  userId: string;
  title: string;
  body: string;
  applicationId: string | null;
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

export async function createCoverLetter(
  userId: string,
  input: { title: string; body?: string; applicationId?: string | null },
): Promise<CoverLetterRecord> {
  await ensureAppSchema();
  const title = requireTitle(input.title);
  const body = typeof input.body === "string" ? input.body : "";
  const applicationId =
    typeof input.applicationId === "string" && input.applicationId.trim()
      ? input.applicationId.trim()
      : null;
  if (!applicationId) {
    throw new Error("Cover letters must be linked to a company / application.");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  await getSql()`
    INSERT INTO cover_letters
      (id, user_id, title, body, application_id, status, created_at, updated_at)
    VALUES (${id}, ${userId}, ${title}, ${body}, ${applicationId}, 'active', ${now}, ${now})
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
    status: CoverLetterStatus;
  }>,
): Promise<CoverLetterRecord> {
  await ensureAppSchema();
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
  const status = patch.status ?? existing.status;
  if (status !== "active" && status !== "archived") throw new Error("Invalid status.");

  const now = new Date().toISOString();
  await getSql()`
    UPDATE cover_letters
    SET title = ${title}, body = ${body}, application_id = ${applicationId},
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
