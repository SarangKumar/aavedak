import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { isGcsConfigured, resumeObjectKey, uploadResumePdf } from "@/lib/gcs";

export type ResumeStatus = "active" | "inactive" | "archived";

export type ResumeRecord = {
  id: string;
  userId: string;
  displayName: string;
  status: ResumeStatus;
  /** GCS object key (e.g. resumes/{userId}/{id}.pdf). Legacy local paths may still appear. */
  storagePath: string;
  originalFilename: string;
  byteSize: number;
  textExcerpt: string | null;
  atsScore: number | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  user_id: string;
  display_name: string;
  status: ResumeStatus;
  storage_path: string;
  original_filename: string;
  byte_size: number;
  extracted_text?: string | null;
  ats_score?: number | string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): ResumeRecord {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    status: row.status,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    byteSize: Number(row.byte_size),
    textExcerpt: row.extracted_text ?? null,
    atsScore:
      row.ats_score === null || row.ats_score === undefined || row.ats_score === ""
        ? null
        : Number(row.ats_score),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listResumes(
  userId: string,
  opts?: { includeArchived?: boolean },
): Promise<ResumeRecord[]> {
  await ensureAppSchema();
  const includeArchived = opts?.includeArchived ?? false;
  const rows = includeArchived
    ? ((await getSql()`
        SELECT * FROM resumes WHERE user_id = ${userId} ORDER BY created_at DESC
      `) as Row[])
    : ((await getSql()`
        SELECT * FROM resumes WHERE user_id = ${userId} AND status != 'archived'
        ORDER BY created_at DESC
      `) as Row[]);
  return rows.map(mapRow);
}

export async function countUsableResumes(userId: string): Promise<number> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT COUNT(*)::int AS n FROM resumes
    WHERE user_id = ${userId} AND status IN ('active', 'inactive')
  `) as Array<{ n: number }>;
  return Number(rows[0]?.n) || 0;
}

export async function hasCompletedOnboardingRequirement(userId: string): Promise<boolean> {
  return (await countUsableResumes(userId)) >= 1;
}

export async function getResume(userId: string, resumeId: string): Promise<ResumeRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM resumes WHERE id = ${resumeId} AND user_id = ${userId}
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getResumeById(resumeId: string): Promise<ResumeRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM resumes WHERE id = ${resumeId}
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getActiveResume(userId: string): Promise<ResumeRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM resumes WHERE user_id = ${userId} AND status = 'active' LIMIT 1
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

function normalizeDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

async function assertUniqueDisplayName(userId: string, displayName: string, excludeId?: string) {
  const rows = (await getSql()`
    SELECT id FROM resumes
    WHERE user_id = ${userId} AND lower(display_name) = lower(${displayName})
    LIMIT 1
  `) as Array<{ id: string }>;
  const row = rows[0];
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
  await ensureAppSchema();
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

  if (!isGcsConfigured()) {
    throw new Error(
      "Resume upload requires Google Cloud Storage. Set GCS_BUCKET and GCS_CLIENT_EMAIL + GCS_PRIVATE_KEY (or GCS_CREDENTIALS_JSON).",
    );
  }

  await assertUniqueDisplayName(opts.userId, displayName);

  const id = randomUUID();
  const objectKey = resumeObjectKey(opts.userId, id);
  const buffer = Buffer.from(await opts.file.arrayBuffer());
  if (buffer.subarray(0, 4).toString("utf8") !== "%PDF") {
    throw new Error("File does not look like a valid PDF.");
  }

  await uploadResumePdf(objectKey, buffer);

  const now = new Date().toISOString();
  const status: ResumeStatus = opts.makeActive === false ? "inactive" : "active";
  const sql = getSql();

  if (status === "active") {
    await sql`
      UPDATE resumes SET status = 'inactive', updated_at = ${now}
      WHERE user_id = ${opts.userId} AND status = 'active'
    `;
  }
  await sql`
    INSERT INTO resumes
      (id, user_id, display_name, status, storage_path, original_filename, byte_size, created_at, updated_at)
    VALUES (
      ${id}, ${opts.userId}, ${displayName}, ${status}, ${objectKey}, ${opts.file.name},
      ${opts.file.size}, ${now}, ${now}
    )
  `;

  const created = await getResume(opts.userId, id);
  if (!created) throw new Error("Failed to create resume.");
  return created;
}

export async function updateResume(
  userId: string,
  resumeId: string,
  patch: { displayName?: string; status?: ResumeStatus },
): Promise<ResumeRecord> {
  await ensureAppSchema();
  const existing = await getResume(userId, resumeId);
  if (!existing) throw new Error("Resume not found.");

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

  const sql = getSql();
  if (status === "active") {
    await sql`
      UPDATE resumes SET status = 'inactive', updated_at = ${now}
      WHERE user_id = ${userId} AND status = 'active' AND id != ${resumeId}
    `;
  }
  await sql`
    UPDATE resumes SET display_name = ${displayName}, status = ${status}, updated_at = ${now}
    WHERE id = ${resumeId} AND user_id = ${userId}
  `;

  const updated = await getResume(userId, resumeId);
  if (!updated) throw new Error("Resume not found after update.");
  return updated;
}

export async function archiveResume(userId: string, resumeId: string): Promise<ResumeRecord> {
  return updateResume(userId, resumeId, { status: "archived" });
}

export async function countActiveResumes(userId: string): Promise<number> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT COUNT(*)::int AS n FROM resumes
    WHERE user_id = ${userId} AND status = 'active'
  `) as Array<{ n: number }>;
  return Number(rows[0]?.n) || 0;
}

/** Permanently delete an inactive/archived resume (PDF + row). Keeps ≥1 active. */
export async function deleteInactiveResume(userId: string, resumeId: string): Promise<void> {
  await ensureAppSchema();
  const existing = await getResume(userId, resumeId);
  if (!existing) throw new Error("Resume not found.");
  if (existing.status === "active") {
    throw new Error("Active resumes cannot be permanently deleted. Demote them first.");
  }
  if ((await countActiveResumes(userId)) < 1) {
    throw new Error("Keep at least one active resume on your profile.");
  }
  const { deleteResumePdf } = await import("@/lib/gcs");
  try {
    await deleteResumePdf(existing.storagePath);
  } catch {
    /* object may already be gone */
  }
  await getSql()`DELETE FROM resumes WHERE id = ${resumeId} AND user_id = ${userId}`;
}

export async function setResumeExtractedText(
  userId: string,
  resumeId: string,
  extractedText: string,
): Promise<void> {
  await ensureAppSchema();
  const existing = await getResume(userId, resumeId);
  if (!existing) throw new Error("Resume not found.");
  const textValue = extractedText.trim();
  if (textValue.length > 200_000) throw new Error("Extracted text is too long.");
  const now = new Date().toISOString();
  await getSql()`
    UPDATE resumes SET extracted_text = ${textValue}, updated_at = ${now}
    WHERE id = ${resumeId} AND user_id = ${userId}
  `;
}
