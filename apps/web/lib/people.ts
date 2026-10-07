import "server-only";

import { randomUUID } from "node:crypto";

import { getAppDb } from "@/lib/app-db";

export type PersonStatus = "active" | "archived";

export type PersonRecord = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  company: string | null;
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

export function listPeople(userId: string, opts?: { includeArchived?: boolean }): PersonRecord[] {
  const includeArchived = opts?.includeArchived ?? false;
  const sql = includeArchived
    ? `SELECT * FROM people WHERE user_id = ? ORDER BY updated_at DESC`
    : `SELECT * FROM people WHERE user_id = ? AND status != 'archived' ORDER BY updated_at DESC`;
  const rows = getAppDb().prepare(sql).all(userId) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export function getPerson(userId: string, id: string): PersonRecord | null {
  const row = getAppDb()
    .prepare(`SELECT * FROM people WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

export function createPerson(
  userId: string,
  input: {
    name: string;
    email?: string | null;
    company?: string | null;
    roleTitle?: string | null;
    notes?: string | null;
    applicationId?: string | null;
  },
): PersonRecord {
  const name = requireName(input.name);
  const id = randomUUID();
  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `INSERT INTO people
        (id, user_id, name, email, company, role_title, notes, application_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(
      id,
      userId,
      name,
      optional(input.email),
      optional(input.company),
      optional(input.roleTitle),
      optional(input.notes),
      optional(input.applicationId),
      now,
      now,
    );
  return getPerson(userId, id)!;
}

export function updatePerson(
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
): PersonRecord {
  const existing = getPerson(userId, id);
  if (!existing) throw new Error("Person not found.");

  const name = patch.name !== undefined ? requireName(patch.name) : existing.name;
  const email = patch.email !== undefined ? optional(patch.email) : existing.email;
  const company = patch.company !== undefined ? optional(patch.company) : existing.company;
  const roleTitle = patch.roleTitle !== undefined ? optional(patch.roleTitle) : existing.roleTitle;
  const notes = patch.notes !== undefined ? optional(patch.notes) : existing.notes;
  const applicationId =
    patch.applicationId !== undefined ? optional(patch.applicationId) : existing.applicationId;
  const status = patch.status ?? existing.status;
  if (status !== "active" && status !== "archived") throw new Error("Invalid status.");

  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `UPDATE people SET name = ?, email = ?, company = ?, role_title = ?, notes = ?,
         application_id = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(name, email, company, roleTitle, notes, applicationId, status, now, id, userId);
  return getPerson(userId, id)!;
}

export function archivePerson(userId: string, id: string): PersonRecord {
  return updatePerson(userId, id, { status: "archived" });
}
