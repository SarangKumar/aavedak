import "server-only";

import { randomUUID } from "node:crypto";

import { dbAll, dbGet, dbRun } from "@/lib/app-db";
import { ensureCompany } from "@/lib/companies";

export type PersonStatus = "active" | "archived";

export type PersonRecord = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  company: string | null;
  companyId: string | null;
  roleTitle: string | null;
  notes: string | null;
  applicationId: string | null;
  status: PersonStatus;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  company: string | null;
  company_id?: string | null;
  role_title: string | null;
  notes: string | null;
  application_id: string | null;
  status: PersonStatus;
  created_at: string;
  updated_at: string;
}): PersonRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    company: row.company,
    companyId: row.company_id ?? null,
    roleTitle: row.role_title,
    notes: row.notes,
    applicationId: row.application_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) throw new Error("Name is required.");
  const n = name.trim();
  if (n.length > 200) throw new Error("Name is too long.");
  return n;
}

function optional(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

export async function listPeople(
  userId: string,
  opts?: { includeArchived?: boolean },
): Promise<PersonRecord[]> {
  const includeArchived = opts?.includeArchived ?? false;
  const sql = includeArchived
    ? `SELECT * FROM people WHERE user_id = ? ORDER BY updated_at DESC`
    : `SELECT * FROM people WHERE user_id = ? AND status != 'archived' ORDER BY updated_at DESC`;
  const rows = (await dbAll(sql, userId)) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export async function getPerson(userId: string, id: string): Promise<PersonRecord | null> {
  const row = (await dbGet(`SELECT * FROM people WHERE id = ? AND user_id = ?`, id, userId)) as
    Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

export async function createPerson(
  userId: string,
  input: {
    name: string;
    email?: string | null;
    company?: string | null;
    roleTitle?: string | null;
    notes?: string | null;
    applicationId?: string | null;
    companyId?: string | null;
  },
): Promise<PersonRecord> {
  const name = requireName(input.name);
  const companyName = optional(input.company);
  const company = companyName ? await ensureCompany(userId, companyName) : null;
  const id = randomUUID();
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO people
        (id, user_id, name, email, company, company_id, role_title, notes, application_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    id,
    userId,
    name,
    optional(input.email),
    company?.name ?? companyName,
    optional(input.companyId) ?? company?.id ?? null,
    optional(input.roleTitle),
    optional(input.notes),
    optional(input.applicationId),
    now,
    now,
  );
  const created = await getPerson(userId, id);
  if (!created) throw new Error("Could not save person.");
  return created;
}

export async function updatePerson(
  userId: string,
  id: string,
  patch: Partial<{
    name: string;
    email: string | null;
    company: string | null;
    roleTitle: string | null;
    notes: string | null;
    applicationId: string | null;
    status: PersonStatus;
  }>,
): Promise<PersonRecord> {
  const existing = await getPerson(userId, id);
  if (!existing) throw new Error("Person not found.");

  const name = patch.name !== undefined ? requireName(patch.name) : existing.name;
  const email = patch.email !== undefined ? optional(patch.email) : existing.email;
  const company = patch.company !== undefined ? optional(patch.company) : existing.company;
  const companyId =
    patch.company !== undefined
      ? company
        ? (await ensureCompany(userId, company)).id
        : null
      : existing.companyId;
  const roleTitle = patch.roleTitle !== undefined ? optional(patch.roleTitle) : existing.roleTitle;
  const notes = patch.notes !== undefined ? optional(patch.notes) : existing.notes;
  const applicationId =
    patch.applicationId !== undefined ? optional(patch.applicationId) : existing.applicationId;
  const status = patch.status ?? existing.status;
  if (status !== "active" && status !== "archived") throw new Error("Invalid status.");

  const now = new Date().toISOString();
  await dbRun(
    `UPDATE people SET name = ?, email = ?, company = ?, company_id = ?, role_title = ?, notes = ?,
         application_id = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    name,
    email,
    company,
    companyId,
    roleTitle,
    notes,
    applicationId,
    status,
    now,
    id,
    userId,
  );
  const updated = await getPerson(userId, id);
  if (!updated) throw new Error("Person not found.");
  return updated;
}

export async function archivePerson(userId: string, id: string): Promise<PersonRecord> {
  return updatePerson(userId, id, { status: "archived" });
}
