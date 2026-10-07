import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";

export type PersonStatus = "active" | "archived";

/**
 * Global shared people directory (referrals).
 * `userId` is who added the contact (nullable after account delete) — not ownership.
 */
export type PersonRecord = {
  id: string;
  /** Who added this person; null if adder deleted their account. */
  userId: string | null;
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

type Row = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  company: string | null;
  role_title: string | null;
  notes: string | null;
  application_id: string | null;
  status: PersonStatus;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): PersonRecord {
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

/** List the shared people directory (all users). */
export async function listPeople(opts?: { includeArchived?: boolean }): Promise<PersonRecord[]> {
  await ensureAppSchema();
  const includeArchived = opts?.includeArchived ?? false;
  const rows = includeArchived
    ? ((await getSql()`
        SELECT * FROM people ORDER BY updated_at DESC
      `) as Row[])
    : ((await getSql()`
        SELECT * FROM people WHERE status != 'archived'
        ORDER BY updated_at DESC
      `) as Row[]);
  return rows.map(mapRow);
}

export async function getPerson(id: string): Promise<PersonRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM people WHERE id = ${id}
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createPerson(
  addedByUserId: string,
  input: {
    name: string;
    email?: string | null;
    company?: string | null;
    roleTitle?: string | null;
    notes?: string | null;
    applicationId?: string | null;
  },
): Promise<PersonRecord> {
  await ensureAppSchema();
  const name = requireName(input.name);
  const id = randomUUID();
  const now = new Date().toISOString();
  const email = optional(input.email);
  const company = optional(input.company);
  const roleTitle = optional(input.roleTitle);
  const notes = optional(input.notes);
  const applicationId = optional(input.applicationId);
  await getSql()`
    INSERT INTO people
      (id, user_id, name, email, company, role_title, notes, application_id, status, created_at, updated_at)
    VALUES (
      ${id}, ${addedByUserId}, ${name}, ${email}, ${company}, ${roleTitle}, ${notes}, ${applicationId},
      'active', ${now}, ${now}
    )
  `;
  const created = await getPerson(id);
  if (!created) throw new Error("Failed to create person.");
  return created;
}

export async function updatePerson(
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
  await ensureAppSchema();
  const existing = await getPerson(id);
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
  await getSql()`
    UPDATE people SET
      name = ${name}, email = ${email}, company = ${company}, role_title = ${roleTitle},
      notes = ${notes}, application_id = ${applicationId}, status = ${status}, updated_at = ${now}
    WHERE id = ${id}
  `;
  const updated = await getPerson(id);
  if (!updated) throw new Error("Person not found after update.");
  return updated;
}

export async function archivePerson(id: string): Promise<PersonRecord> {
  return updatePerson(id, { status: "archived" });
}

/** Keep people rows; clear adder + application links for a deleted account. */
export async function detachPeopleForDeletedUser(userId: string): Promise<void> {
  await ensureAppSchema();
  const now = new Date().toISOString();
  await getSql()`
    UPDATE people
    SET user_id = NULL,
        application_id = NULL,
        updated_at = ${now}
    WHERE user_id = ${userId}
       OR application_id IN (SELECT id FROM applications WHERE user_id = ${userId})
  `;
}
