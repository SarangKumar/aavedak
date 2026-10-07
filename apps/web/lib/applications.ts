import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import {
  isApplicationStatus,
  isArchivedStatus,
  type ApplicationStatus,
} from "@/lib/application-status";
import type { ApplicationImportItem } from "@/lib/application-import";
import { ensureCompany } from "@/lib/companies";
import { setJobApplicationLink } from "@/lib/jobs";

export type ApplicationRecord = {
  id: string;
  userId: string;
  companyName: string;
  companyId: string | null;
  role: string;
  location: string;
  salaryCtc: string | null;
  jobLink: string | null;
  jobId: string | null;
  coverLetterId: string | null;
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
  coverLetterId?: string | null;
  companyId?: string | null;
  status?: ApplicationStatus;
  notes?: string | null;
  appliedAt?: string | null;
  createdAt?: string | null;
};

type ApplicationRow = {
  id: string;
  user_id: string;
  company_name: string;
  company_id?: string | null;
  role: string;
  location: string;
  salary_ctc: string | null;
  job_link: string | null;
  job_id: string | null;
  cover_letter_id?: string | null;
  status: string;
  notes: string | null;
  applied_at?: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: ApplicationRow): ApplicationRecord {
  if (!isApplicationStatus(row.status)) {
    throw new Error(`Invalid status in DB: ${row.status}`);
  }
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    companyId: row.company_id ?? null,
    role: row.role,
    location: row.location,
    salaryCtc: row.salary_ctc,
    jobLink: row.job_link,
    jobId: row.job_id,
    coverLetterId: row.cover_letter_id ?? null,
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

export async function listApplications(
  userId: string,
  scope: "active" | "archived" = "active",
): Promise<ApplicationRecord[]> {
  await ensureAppSchema();
  const sql = getSql();
  const rows =
    scope === "archived"
      ? ((await sql`
          SELECT * FROM applications
          WHERE user_id = ${userId} AND status = 'archived'
          ORDER BY updated_at DESC
        `) as ApplicationRow[])
      : ((await sql`
          SELECT * FROM applications
          WHERE user_id = ${userId} AND status != 'archived'
          ORDER BY updated_at DESC
        `) as ApplicationRow[]);
  return rows.map(mapRow);
}

export async function getApplication(
  userId: string,
  id: string,
): Promise<ApplicationRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM applications WHERE id = ${id} AND user_id = ${userId}
  `) as ApplicationRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findApplicationByCompanyRole(
  userId: string,
  companyName: string,
  role: string,
): Promise<ApplicationRecord | null> {
  await ensureAppSchema();
  const company = companyName.trim();
  const roleName = role.trim();
  const rows = (await getSql()`
    SELECT * FROM applications
    WHERE user_id = ${userId}
      AND lower(company_name) = lower(${company})
      AND lower(role) = lower(${roleName})
    ORDER BY created_at ASC
    LIMIT 1
  `) as ApplicationRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findDuplicateWarnings(
  userId: string,
  companyName: string,
  role: string,
  excludeId?: string,
): Promise<ApplicationRecord[]> {
  await ensureAppSchema();
  const company = companyName.trim();
  const roleName = role.trim();
  const rows = (await getSql()`
    SELECT * FROM applications
    WHERE user_id = ${userId}
      AND lower(company_name) = lower(${company})
      AND lower(role) = lower(${roleName})
      AND status != 'archived'
  `) as ApplicationRow[];
  return rows.map(mapRow).filter((r) => r.id !== excludeId);
}

export async function createApplication(
  userId: string,
  input: CreateApplicationInput,
): Promise<ApplicationRecord> {
  await ensureAppSchema();
  const companyName = requireText(input.companyName, "Company name");
  const role = requireText(input.role, "Role");
  const location = requireText(input.location, "Location");
  const salaryCtc = optionalText(input.salaryCtc ?? null);
  const jobLink = optionalText(input.jobLink ?? null);
  const jobId = optionalText(input.jobId ?? null);
  const coverLetterId = optionalText(input.coverLetterId ?? null);
  const notes = optionalText(input.notes ?? null);
  const status: ApplicationStatus =
    input.status && isApplicationStatus(input.status) ? input.status : "bookmarked";

  if (companyName.length > 200) throw new Error("Company name is too long.");
  if (role.length > 200) throw new Error("Role is too long.");
  if (location.length > 200) throw new Error("Location is too long.");

  const company = await ensureCompany(companyName);
  const companyId = optionalText(input.companyId ?? null) || company.id;

  const now = new Date().toISOString();
  const createdAt = optionalText(input.createdAt ?? null) || now;
  const appliedAt = optionalText(input.appliedAt ?? null) || optionalText(input.createdAt ?? null);

  const id = randomUUID();
  await getSql()`
    INSERT INTO applications
      (id, user_id, company_name, company_id, role, location, salary_ctc, job_link, job_id,
       cover_letter_id, status, notes, applied_at, created_at, updated_at)
    VALUES (
      ${id}, ${userId}, ${companyName}, ${companyId}, ${role}, ${location}, ${salaryCtc}, ${jobLink},
      ${jobId}, ${coverLetterId}, ${status}, ${notes}, ${appliedAt}, ${createdAt}, ${createdAt}
    )
  `;

  if (jobId) {
    await setJobApplicationLink(userId, jobId, id);
  }

  const created = await getApplication(userId, id);
  if (!created) throw new Error("Failed to create application.");
  return created;
}

export async function updateApplication(
  userId: string,
  id: string,
  patch: Partial<{
    companyName: string;
    role: string;
    location: string;
    salaryCtc: string | null;
    jobLink: string | null;
    jobId: string | null;
    coverLetterId: string | null;
    companyId: string | null;
    status: ApplicationStatus;
    notes: string | null;
    appliedAt: string | null;
  }>,
): Promise<ApplicationRecord> {
  await ensureAppSchema();
  const existing = await getApplication(userId, id);
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
  const coverLetterId =
    patch.coverLetterId !== undefined ? optionalText(patch.coverLetterId) : existing.coverLetterId;
  const notes = patch.notes !== undefined ? optionalText(patch.notes) : existing.notes;
  const appliedAt =
    patch.appliedAt !== undefined ? optionalText(patch.appliedAt) : existing.appliedAt;
  let status = existing.status;
  if (patch.status !== undefined) {
    if (!isApplicationStatus(patch.status)) throw new Error("Invalid status.");
    status = patch.status;
  }

  let companyId = existing.companyId;
  if (patch.companyName !== undefined || patch.companyId !== undefined) {
    const company = await ensureCompany(companyName);
    companyId = optionalText(patch.companyId ?? null) || company.id;
  }

  const now = new Date().toISOString();
  await getSql()`
    UPDATE applications SET
      company_name = ${companyName},
      company_id = ${companyId},
      role = ${role},
      location = ${location},
      salary_ctc = ${salaryCtc},
      job_link = ${jobLink},
      job_id = ${jobId},
      cover_letter_id = ${coverLetterId},
      status = ${status},
      notes = ${notes},
      applied_at = ${appliedAt},
      updated_at = ${now}
    WHERE id = ${id} AND user_id = ${userId}
  `;

  if (jobId) {
    await setJobApplicationLink(userId, jobId, id);
  }

  const updated = await getApplication(userId, id);
  if (!updated) throw new Error("Application not found after update.");
  return updated;
}

export async function setApplicationStatus(
  userId: string,
  id: string,
  status: ApplicationStatus,
): Promise<ApplicationRecord> {
  if (!isApplicationStatus(status)) throw new Error("Invalid status.");
  return updateApplication(userId, id, { status });
}

/** Hard-delete an application so activity graphs drop that day's contribution. */
export async function deleteApplication(userId: string, id: string): Promise<void> {
  await ensureAppSchema();
  const existing = await getApplication(userId, id);
  if (!existing) throw new Error("Application not found.");
  const now = new Date().toISOString();
  await getSql()`
    UPDATE cover_letters SET application_id = NULL, updated_at = ${now}
    WHERE user_id = ${userId} AND application_id = ${id}
  `;
  await getSql()`
    UPDATE follow_up_tasks SET application_id = NULL, updated_at = ${now}
    WHERE user_id = ${userId} AND application_id = ${id}
  `;
  await getSql()`
    UPDATE people SET application_id = NULL, updated_at = ${now}
    WHERE application_id = ${id}
  `;
  await getSql()`
    UPDATE user_job_state SET application_id = NULL, updated_at = ${now}
    WHERE user_id = ${userId} AND application_id = ${id}
  `;
  await getSql()`DELETE FROM applications WHERE id = ${id} AND user_id = ${userId}`;
}

export async function hasApplicationOnDay(
  userId: string,
  companyName: string,
  role: string,
  appliedAt: string | null | undefined,
): Promise<boolean> {
  await ensureAppSchema();
  const company = companyName.trim();
  const roleName = role.trim();
  const day = appliedAt?.slice(0, 10);
  if (!day) {
    const rows = await getSql()`
      SELECT id FROM applications
      WHERE user_id = ${userId}
        AND lower(company_name) = lower(${company})
        AND lower(role) = lower(${roleName})
      LIMIT 1
    `;
    return rows.length > 0;
  }
  const rows = await getSql()`
    SELECT id FROM applications
    WHERE user_id = ${userId}
      AND lower(company_name) = lower(${company})
      AND lower(role) = lower(${roleName})
      AND substr(COALESCE(applied_at, created_at), 1, 10) = ${day}
    LIMIT 1
  `;
  return rows.length > 0;
}

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

export async function seedDemoAppliedApplications(userId: string): Promise<{
  inserted: ApplicationRecord[];
  skipped: Array<{ companyName: string; role: string }>;
}> {
  await ensureAppSchema();
  const inserted: ApplicationRecord[] = [];
  const skipped: Array<{ companyName: string; role: string }> = [];

  for (const item of SARANG_DEMO_APPLIED) {
    const existing = await findApplicationByCompanyRole(userId, item.companyName, item.role);
    if (existing) {
      skipped.push({ companyName: item.companyName, role: item.role });
      continue;
    }
    inserted.push(
      await createApplication(userId, {
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

export async function importApplications(
  userId: string,
  items: ApplicationImportItem[],
): Promise<{
  inserted: ApplicationRecord[];
  skippedDuplicates: Array<{ companyName: string; role: string }>;
}> {
  await ensureAppSchema();
  const inserted: ApplicationRecord[] = [];
  const skippedDuplicates: Array<{ companyName: string; role: string }> = [];

  for (const item of items) {
    const existing = await findApplicationByCompanyRole(userId, item.company_name, item.role);
    if (existing) {
      skippedDuplicates.push({ companyName: item.company_name, role: item.role });
      continue;
    }
    const dateIso = item.applied_at ?? item.created_at ?? null;
    inserted.push(
      await createApplication(userId, {
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
    companyId: app.companyId,
    role: app.role,
    location: app.location,
    salaryCtc: app.salaryCtc,
    jobLink: app.jobLink,
    jobId: app.jobId,
    coverLetterId: app.coverLetterId,
    status: app.status,
    notes: app.notes,
    appliedAt: app.appliedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export { isArchivedStatus };
