import { randomUUID } from "node:crypto";

import { getAppDb } from "@/lib/app-db";
import {
  isApplicationStatus,
  isArchivedStatus,
  type ApplicationStatus,
} from "@/lib/application-status";

export type ApplicationRecord = {
  id: string;
  userId: string;
  companyName: string;
  role: string;
  location: string;
  salaryCtc: string | null;
  jobLink: string | null;
  jobId: string | null;
  status: ApplicationStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateApplicationInput = {
  companyName: string;
  role: string;
  location: string;
  salaryCtc?: string | null;
  jobLink?: string | null;
  jobId?: string | null;
  status?: ApplicationStatus;
  notes?: string | null;
};

function mapRow(row: {
  id: string;
  user_id: string;
  company_name: string;
  role: string;
  location: string;
  salary_ctc: string | null;
  job_link: string | null;
  job_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): ApplicationRecord {
  if (!isApplicationStatus(row.status)) {
    throw new Error(`Invalid status in DB: ${row.status}`);
  }
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    role: row.role,
    location: row.location,
    salaryCtc: row.salary_ctc,
    jobLink: row.job_link,
    jobId: row.job_id,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function listApplications(
  userId: string,
  scope: "active" | "archived" = "active",
): ApplicationRecord[] {
  const sql =
    scope === "archived"
      ? `SELECT * FROM applications WHERE user_id = ? AND status = 'archived' ORDER BY updated_at DESC`
      : `SELECT * FROM applications WHERE user_id = ? AND status != 'archived' ORDER BY updated_at DESC`;
  const rows = getAppDb().prepare(sql).all(userId) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export function getApplication(userId: string, id: string): ApplicationRecord | null {
  const row = getAppDb()
    .prepare(`SELECT * FROM applications WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

export function findDuplicateWarnings(
  userId: string,
  companyName: string,
  role: string,
  excludeId?: string,
): ApplicationRecord[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM applications
       WHERE user_id = ?
         AND company_name = ? COLLATE NOCASE
         AND role = ? COLLATE NOCASE
         AND status != 'archived'`,
    )
    .all(userId, companyName.trim(), role.trim()) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow).filter((r) => r.id !== excludeId);
}

export function createApplication(
  userId: string,
  input: CreateApplicationInput,
): ApplicationRecord {
  const companyName = requireText(input.companyName, "Company name");
  const role = requireText(input.role, "Role");
  const location = requireText(input.location, "Location");
  const salaryCtc = optionalText(input.salaryCtc ?? null);
  const jobLink = optionalText(input.jobLink ?? null);
  const jobId = optionalText(input.jobId ?? null);
  const notes = optionalText(input.notes ?? null);
  const status: ApplicationStatus =
    input.status && isApplicationStatus(input.status) ? input.status : "bookmarked";

  if (companyName.length > 200) throw new Error("Company name is too long.");
  if (role.length > 200) throw new Error("Role is too long.");
  if (location.length > 200) throw new Error("Location is too long.");

  const id = randomUUID();
  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `INSERT INTO applications
        (id, user_id, company_name, role, location, salary_ctc, job_link, job_id, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      userId,
      companyName,
      role,
      location,
      salaryCtc,
      jobLink,
      jobId,
      status,
      notes,
      now,
      now,
    );

  return getApplication(userId, id)!;
}

export function updateApplication(
  userId: string,
  id: string,
  patch: Partial<{
    companyName: string;
    role: string;
    location: string;
    salaryCtc: string | null;
    jobLink: string | null;
    jobId: string | null;
    status: ApplicationStatus;
    notes: string | null;
  }>,
): ApplicationRecord {
  const existing = getApplication(userId, id);
  if (!existing) throw new Error("Application not found.");

  const companyName =
    patch.companyName !== undefined
      ? requireText(patch.companyName, "Company name")
      : existing.companyName;
  const role = patch.role !== undefined ? requireText(patch.role, "Role") : existing.role;
  const location =
    patch.location !== undefined ? requireText(patch.location, "Location") : existing.location;
  const salaryCtc =
    patch.salaryCtc !== undefined ? optionalText(patch.salaryCtc) : existing.salaryCtc;
  const jobLink = patch.jobLink !== undefined ? optionalText(patch.jobLink) : existing.jobLink;
  const jobId = patch.jobId !== undefined ? optionalText(patch.jobId) : existing.jobId;
  const notes = patch.notes !== undefined ? optionalText(patch.notes) : existing.notes;
  let status = existing.status;
  if (patch.status !== undefined) {
    if (!isApplicationStatus(patch.status)) throw new Error("Invalid status.");
    status = patch.status;
  }

  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `UPDATE applications SET
         company_name = ?, role = ?, location = ?, salary_ctc = ?, job_link = ?, job_id = ?,
         status = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(companyName, role, location, salaryCtc, jobLink, jobId, status, notes, now, id, userId);

  return getApplication(userId, id)!;
}

export function setApplicationStatus(
  userId: string,
  id: string,
  status: ApplicationStatus,
): ApplicationRecord {
  if (!isApplicationStatus(status)) throw new Error("Invalid status.");
  return updateApplication(userId, id, { status });
}

export { isArchivedStatus };
