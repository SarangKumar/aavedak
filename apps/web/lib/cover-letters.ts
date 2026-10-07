import { randomUUID } from "node:crypto";

import { getAppDb } from "@/lib/app-db";

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

function mapRow(row: {
  id: string;
  user_id: string;
  title: string;
  body: string;
  application_id: string | null;
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

export function listCoverLetters(
  userId: string,
  opts?: { includeArchived?: boolean },
): CoverLetterRecord[] {
  const includeArchived = opts?.includeArchived ?? false;
  const sql = includeArchived
    ? `SELECT * FROM cover_letters WHERE user_id = ? ORDER BY updated_at DESC`
    : `SELECT * FROM cover_letters WHERE user_id = ? AND status != 'archived' ORDER BY updated_at DESC`;
  const rows = getAppDb().prepare(sql).all(userId) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export function getCoverLetter(userId: string, id: string): CoverLetterRecord | null {
  const row = getAppDb()
    .prepare(`SELECT * FROM cover_letters WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

export function createCoverLetter(
  userId: string,
  input: { title: string; body?: string; applicationId?: string | null },
): CoverLetterRecord {
  const title = requireTitle(input.title);
  const body = typeof input.body === "string" ? input.body : "";
  const applicationId =
    typeof input.applicationId === "string" && input.applicationId.trim()
      ? input.applicationId.trim()
      : null;
  const id = randomUUID();
  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `INSERT INTO cover_letters
        (id, user_id, title, body, application_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(id, userId, title, body, applicationId, now, now);
  return getCoverLetter(userId, id)!;
}

export function updateCoverLetter(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    body: string;
    applicationId: string | null;
    status: CoverLetterStatus;
  }>,
): CoverLetterRecord {
  const existing = getCoverLetter(userId, id);
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
  getAppDb()
    .prepare(
      `UPDATE cover_letters SET title = ?, body = ?, application_id = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(title, body, applicationId, status, now, id, userId);
  return getCoverLetter(userId, id)!;
}

export function archiveCoverLetter(userId: string, id: string): CoverLetterRecord {
  return updateCoverLetter(userId, id, { status: "archived" });
}
