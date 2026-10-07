import "server-only";

import { randomUUID } from "node:crypto";

import { dbAll, dbGet, dbRun } from "@/lib/app-db";

export type CompanyRecord = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}): CompanyRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCompanies(userId: string): Promise<CompanyRecord[]> {
  const rows = await dbAll<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM companies WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC`,
    userId,
  );
  return rows.map(mapRow);
}

export async function findCompanyByName(
  userId: string,
  name: string,
): Promise<CompanyRecord | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const row = await dbGet<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM companies WHERE user_id = ? AND name = ? COLLATE NOCASE LIMIT 1`,
    userId,
    trimmed,
  );
  return row ? mapRow(row) : null;
}

/** Create a company if this user does not already have the same name. */
export async function ensureCompany(userId: string, name: string): Promise<CompanyRecord> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Company name is required.");
  if (trimmed.length > 200) throw new Error("Company name is too long.");
  const existing = await findCompanyByName(userId, trimmed);
  if (existing) return existing;
  const id = randomUUID();
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO companies (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    id,
    userId,
    trimmed,
    now,
    now,
  );
  const created = await findCompanyByName(userId, trimmed);
  if (!created) throw new Error("Could not save company.");
  return created;
}
