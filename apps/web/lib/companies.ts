import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";

export type CompanyRecord = {
  id: string;
  name: string;
  nameKey: string;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  name: string;
  name_key: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.name_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function companyNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function listCompanies(opts?: {
  query?: string;
  limit?: number;
}): Promise<CompanyRecord[]> {
  await ensureAppSchema();
  const limit = Math.min(Math.max(opts?.limit ?? 80, 1), 200);
  const q = opts?.query?.trim() ?? "";
  if (!q) {
    const rows = (await getSql()`
      SELECT * FROM companies ORDER BY name ASC LIMIT ${limit}
    `) as Row[];
    return rows.map(mapRow);
  }
  const like = `%${companyNameKey(q)}%`;
  const rows = (await getSql()`
    SELECT * FROM companies
    WHERE name_key LIKE ${like}
    ORDER BY name ASC
    LIMIT ${limit}
  `) as Row[];
  return rows.map(mapRow);
}

export async function getCompany(id: string): Promise<CompanyRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM companies WHERE id = ${id}
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findCompanyByName(name: string): Promise<CompanyRecord | null> {
  await ensureAppSchema();
  const key = companyNameKey(name);
  if (!key) return null;
  const rows = (await getSql()`
    SELECT * FROM companies WHERE name_key = ${key} LIMIT 1
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Find or create a company by display name. */
export async function ensureCompany(name: string): Promise<CompanyRecord> {
  await ensureAppSchema();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Company name is required.");
  if (trimmed.length > 200) throw new Error("Company name is too long.");
  const existing = await findCompanyByName(trimmed);
  if (existing) return existing;
  const id = randomUUID();
  const now = new Date().toISOString();
  const key = companyNameKey(trimmed);
  try {
    await getSql()`
      INSERT INTO companies (id, name, name_key, created_at, updated_at)
      VALUES (${id}, ${trimmed}, ${key}, ${now}, ${now})
    `;
  } catch {
    const raced = await findCompanyByName(trimmed);
    if (raced) return raced;
    throw new Error("Could not create company.");
  }
  const created = await getCompany(id);
  if (!created) throw new Error("Failed to create company.");
  return created;
}
