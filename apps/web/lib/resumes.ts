import "server-only";

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { dbAll, dbGet, getAppDb, getResumesRoot } from "@/lib/app-db";
import { extractPdfText } from "@/lib/match-score";

export type ResumeStatus = "active" | "inactive" | "archived";

export type ResumeRecord = {
  id: string;
  userId: string;
  displayName: string;
  status: ResumeStatus;
  storagePath: string;
  originalFilename: string;
  byteSize: number;
  textExcerpt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  user_id: string;
  display_name: string;
  status: ResumeStatus;
  storage_path: string;
  original_filename: string;
  byte_size: number;
  text_excerpt?: string | null;
  created_at: string;
  updated_at: string;
}): ResumeRecord {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    status: row.status,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    byteSize: Number(row.byte_size) || 0,
    textExcerpt: row.text_excerpt ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listResumes(
  userId: string,
  opts?: { includeArchived?: boolean },
): Promise<ResumeRecord[]> {
  const includeArchived = opts?.includeArchived ?? false;
  const sql = includeArchived
    ? `SELECT * FROM resumes WHERE user_id = ? ORDER BY created_at DESC`
    : `SELECT * FROM resumes WHERE user_id = ? AND status != 'archived' ORDER BY created_at DESC`;
  const rows = (await dbAll(sql, userId)) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export async function countUsableResumes(userId: string): Promise<number> {
  const row = await dbGet<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM resumes WHERE user_id = ? AND status IN ('active', 'inactive')`,
    userId,
  );
  return Number(row?.n ?? 0);
}

export async function hasCompletedOnboardingRequirement(userId: string): Promise<boolean> {
  return (await countUsableResumes(userId)) >= 1;
}

export async function getResume(userId: string, resumeId: string): Promise<ResumeRecord | null> {
  const row = (await dbGet(
    `SELECT * FROM resumes WHERE id = ? AND user_id = ?`,
    resumeId,
    userId,
  )) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

export async function getResumeById(resumeId: string): Promise<ResumeRecord | null> {
  const row = (await dbGet(`SELECT * FROM resumes WHERE id = ?`, resumeId)) as
    Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

export async function getActiveResume(userId: string): Promise<ResumeRecord | null> {
  const row = (await dbGet(
    `SELECT * FROM resumes WHERE user_id = ? AND status = 'active' LIMIT 1`,
    userId,
  )) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

function normalizeDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

async function assertUniqueDisplayName(userId: string, displayName: string, excludeId?: string) {
  const row = (await dbGet(
    `SELECT id FROM resumes WHERE user_id = ? AND display_name = ? COLLATE NOCASE LIMIT 1`,
    userId,
    displayName,
  )) as { id: string } | undefined;
  if (row && row.id !== excludeId) {
    throw new Error("Display name must be unique among your resumes.");
  }
}

export async function createResumeFromPdf(opts: {
  userId: string;
  displayName: string;
  file: File;
  makeActive?: boolean;
}): Promise<ResumeRecord> {
  const displayName = normalizeDisplayName(opts.displayName);
  if (!displayName) throw new Error("Display name is required.");
  if (displayName.length > 120) throw new Error("Display name is too long.");

  const mime = opts.file.type || "";
  const nameLower = opts.file.name.toLowerCase();
  if (mime !== "application/pdf" && !nameLower.endsWith(".pdf")) {
    throw new Error("Only PDF resumes are allowed.");
  }
  if (opts.file.size <= 0) throw new Error("Empty file.");
  if (opts.file.size > 10 * 1024 * 1024) throw new Error("PDF must be 10MB or smaller.");

  await assertUniqueDisplayName(opts.userId, displayName);

  const id = randomUUID();
  const userDir = path.join(getResumesRoot(), opts.userId);
  fs.mkdirSync(userDir, { recursive: true });
  const storagePath = path.join(userDir, `${id}.pdf`);
  const buffer = Buffer.from(await opts.file.arrayBuffer());
  // Basic PDF magic header check
  if (buffer.subarray(0, 4).toString("utf8") !== "%PDF") {
    throw new Error("File does not look like a valid PDF.");
  }
  try {
    fs.writeFileSync(storagePath, buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "write failed";
    throw new Error(
      `Could not store the resume file (${message}). Serverless disks are ephemeral — durable files need object storage (R2).`,
    );
  }

  const now = new Date().toISOString();
  const status: ResumeStatus = opts.makeActive === false ? "inactive" : "active";
  const db = await getAppDb();
  const excerpt = extractPdfText(buffer);

  if (status === "active") {
    await db
      .prepare(
        `UPDATE resumes SET status = 'inactive', updated_at = ? WHERE user_id = ? AND status = 'active'`,
      )
      .run(now, opts.userId);
  }
  await db
    .prepare(
      `INSERT INTO resumes
        (id, user_id, display_name, status, storage_path, original_filename, byte_size, text_excerpt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      opts.userId,
      displayName,
      status,
      storagePath,
      opts.file.name,
      opts.file.size,
      excerpt || null,
      now,
      now,
    );

  return (await getResume(opts.userId, id))!;
}

export async function updateResume(
  userId: string,
  resumeId: string,
  patch: { displayName?: string; status?: ResumeStatus },
): Promise<ResumeRecord> {
  const existing = await getResume(userId, resumeId);
  if (!existing) throw new Error("Resume not found.");
  if (existing.status === "archived" && patch.status !== "inactive" && patch.status !== "active") {
    // allow restore to inactive/active; block other ops on archived without restore
  }

  const now = new Date().toISOString();
  let displayName = existing.displayName;
  if (patch.displayName !== undefined) {
    displayName = normalizeDisplayName(patch.displayName);
    if (!displayName) throw new Error("Display name is required.");
    await assertUniqueDisplayName(userId, displayName, resumeId);
  }

  let status = existing.status;
  if (patch.status) {
    if (!["active", "inactive", "archived"].includes(patch.status)) {
      throw new Error("Invalid status.");
    }
    status = patch.status;
  }

  const db = await getAppDb();
  if (status === "active") {
    await db
      .prepare(
        `UPDATE resumes SET status = 'inactive', updated_at = ?
         WHERE user_id = ? AND status = 'active' AND id != ?`,
      )
      .run(now, userId, resumeId);
  }
  await db
    .prepare(
      `UPDATE resumes SET display_name = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    )
    .run(displayName, status, now, resumeId, userId);

  return (await getResume(userId, resumeId))!;
}

/** Soft-delete: archive only (v1). Original PDF stays on disk. */
export async function archiveResume(userId: string, resumeId: string): Promise<ResumeRecord> {
  return updateResume(userId, resumeId, { status: "archived" });
}
