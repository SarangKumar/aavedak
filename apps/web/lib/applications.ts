import { randomUUID } from "node:crypto";

import { getAppDb } from "@/lib/app-db";
import {
  isApplicationStatus,
  isArchivedStatus,
  type ApplicationStatus,
} from "@/lib/application-status";
import type { ApplicationImportItem } from "@/lib/application-import";

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
  appliedAt: string | null;
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
  appliedAt?: string | null;
  /** When set, used for created_at / updated_at (seed / import). */
  createdAt?: string | null;
};

type ApplicationRow = {
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
  applied_at?: string | null;
  created_at: string;
  updated_at: string;
};

let schemaReady = false;

function ensureApplicationsSchema() {
  if (schemaReady) return;
  const db = getAppDb();
  const cols = db.prepare(`PRAGMA table_info(applications)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "applied_at")) {
    db.exec(`ALTER TABLE applications ADD COLUMN applied_at TEXT`);
  }
  schemaReady = true;
}

function mapRow(row: ApplicationRow): ApplicationRecord {
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
    appliedAt: row.applied_at ?? null,
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
  ensureApplicationsSchema();
  const sql =
    scope === "archived"
      ? `SELECT * FROM applications WHERE user_id = ? AND status = 'archived' ORDER BY updated_at DESC`
      : `SELECT * FROM applications WHERE user_id = ? AND status != 'archived' ORDER BY updated_at DESC`;
  const rows = getAppDb().prepare(sql).all(userId) as ApplicationRow[];
  return rows.map(mapRow);
}

export function getApplication(userId: string, id: string): ApplicationRecord | null {
  ensureApplicationsSchema();
  const row = getAppDb()
    .prepare(`SELECT * FROM applications WHERE id = ? AND user_id = ?`)
    .get(id, userId) as ApplicationRow | undefined;
  return row ? mapRow(row) : null;
}

export function findApplicationByCompanyRole(
  userId: string,
  companyName: string,
  role: string,
): ApplicationRecord | null {
  ensureApplicationsSchema();
  const row = getAppDb()
    .prepare(
      `SELECT * FROM applications
       WHERE user_id = ?
         AND company_name = ? COLLATE NOCASE
         AND role = ? COLLATE NOCASE
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get(userId, companyName.trim(), role.trim()) as ApplicationRow | undefined;
  return row ? mapRow(row) : null;
}

export function findDuplicateWarnings(
  userId: string,
  companyName: string,
  role: string,
  excludeId?: string,
): ApplicationRecord[] {
  ensureApplicationsSchema();
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM applications
       WHERE user_id = ?
         AND company_name = ? COLLATE NOCASE
         AND role = ? COLLATE NOCASE
         AND status != 'archived'`,
    )
    .all(userId, companyName.trim(), role.trim()) as ApplicationRow[];
  return rows.map(mapRow).filter((r) => r.id !== excludeId);
}

export function createApplication(
  userId: string,
  input: CreateApplicationInput,
): ApplicationRecord {
  ensureApplicationsSchema();
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

  const now = new Date().toISOString();
  const createdAt = optionalText(input.createdAt ?? null) || now;
  const appliedAt = optionalText(input.appliedAt ?? null) || optionalText(input.createdAt ?? null);

  const id = randomUUID();
  getAppDb()
    .prepare(
      `INSERT INTO applications
        (id, user_id, company_name, role, location, salary_ctc, job_link, job_id, status, notes, applied_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      appliedAt,
      createdAt,
      createdAt,
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
    appliedAt: string | null;
  }>,
): ApplicationRecord {
  ensureApplicationsSchema();
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
  const appliedAt =
    patch.appliedAt !== undefined ? optionalText(patch.appliedAt) : existing.appliedAt;
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
         status = ?, notes = ?, applied_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(
      companyName,
      role,
      location,
      salaryCtc,
      jobLink,
      jobId,
      status,
      notes,
      appliedAt,
      now,
      id,
      userId,
    );

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

/** Sarang's already-applied roles — upsert by company+role (skip if present). */
export const SARANG_DEMO_APPLIED = [
  {
    companyName: "JioSaavn",
    role: "SDE-BE",
    location: "Mumbai",
    status: "applied" as const,
    appliedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    companyName: "Kobie",
    role: "SDE",
    location: "Bangalore",
    status: "applied" as const,
    appliedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    companyName: "Teradata",
    role: "SDE",
    location: "Hyderabad",
    status: "applied" as const,
    appliedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    companyName: "Zuvees",
    role: "SDE-1",
    location: "Bangalore",
    status: "applied" as const,
    appliedAt: "2026-09-23T00:00:00.000Z",
  },
] as const;

export function seedDemoAppliedApplications(userId: string): {
  inserted: ApplicationRecord[];
  skipped: Array<{ companyName: string; role: string }>;
} {
  ensureApplicationsSchema();
  const inserted: ApplicationRecord[] = [];
  const skipped: Array<{ companyName: string; role: string }> = [];

  for (const item of SARANG_DEMO_APPLIED) {
    const existing = findApplicationByCompanyRole(userId, item.companyName, item.role);
    if (existing) {
      skipped.push({ companyName: item.companyName, role: item.role });
      continue;
    }
    inserted.push(
      createApplication(userId, {
        companyName: item.companyName,
        role: item.role,
        location: item.location,
        status: item.status,
        appliedAt: item.appliedAt,
        createdAt: item.appliedAt,
      }),
    );
  }

  return { inserted, skipped };
}

export function importApplications(
  userId: string,
  items: ApplicationImportItem[],
): {
  inserted: ApplicationRecord[];
  skippedDuplicates: Array<{ companyName: string; role: string }>;
} {
  ensureApplicationsSchema();
  const inserted: ApplicationRecord[] = [];
  const skippedDuplicates: Array<{ companyName: string; role: string }> = [];

  for (const item of items) {
    const existing = findApplicationByCompanyRole(userId, item.company_name, item.role);
    if (existing) {
      skippedDuplicates.push({ companyName: item.company_name, role: item.role });
      continue;
    }
    const dateIso = item.applied_at ?? item.created_at ?? null;
    inserted.push(
      createApplication(userId, {
        companyName: item.company_name,
        role: item.role,
        location: item.location,
        status: item.status,
        salaryCtc: item.salary_ctc ?? null,
        jobLink: item.job_link ?? null,
        jobId: item.job_id ?? null,
        notes: item.notes ?? null,
        appliedAt: dateIso,
        createdAt: dateIso,
      }),
    );
  }

  return { inserted, skippedDuplicates };
}

export function applicationToDto(app: ApplicationRecord) {
  return {
    id: app.id,
    companyName: app.companyName,
    role: app.role,
    location: app.location,
    salaryCtc: app.salaryCtc,
    jobLink: app.jobLink,
    jobId: app.jobId,
    status: app.status,
    notes: app.notes,
    appliedAt: app.appliedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export { isArchivedStatus };
