import "server-only";

import fs from "node:fs";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import type { ResumeStatus } from "@/lib/resumes";

export type AdminOverviewCounts = {
  profiles: number;
  applications: number;
  resumes: number;
  people: number;
  templates: number;
};

export type AdminResumeRow = {
  id: string;
  userId: string;
  username: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  displayName: string;
  status: ResumeStatus;
  originalFilename: string;
  byteSize: number;
  fileExists: boolean;
  createdAt: string;
  updatedAt: string;
};

async function countTable(
  table: "profiles" | "applications" | "resumes" | "people" | "templates",
): Promise<number> {
  await ensureAppSchema();
  const sql = getSql();
  const rows =
    table === "profiles"
      ? await sql`SELECT COUNT(*)::int AS n FROM profiles`
      : table === "applications"
        ? await sql`SELECT COUNT(*)::int AS n FROM applications`
        : table === "resumes"
          ? await sql`SELECT COUNT(*)::int AS n FROM resumes`
          : table === "people"
            ? await sql`SELECT COUNT(*)::int AS n FROM people`
            : await sql`SELECT COUNT(*)::int AS n FROM templates`;
  return Number((rows[0] as { n: number }).n) || 0;
}

export async function getAdminOverviewCounts(): Promise<AdminOverviewCounts> {
  return {
    profiles: await countTable("profiles"),
    applications: await countTable("applications"),
    resumes: await countTable("resumes"),
    people: await countTable("people"),
    templates: await countTable("templates"),
  };
}

export async function listRecentResumesForAdmin(limit = 40): Promise<AdminResumeRow[]> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT r.id, r.user_id, r.display_name, r.status, r.storage_path, r.original_filename,
           r.byte_size, r.created_at, r.updated_at,
           p.username, p.email AS owner_email, p.name AS owner_name
    FROM resumes r
    LEFT JOIN profiles p ON p.user_id = r.user_id
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `) as Array<{
    id: string;
    user_id: string;
    display_name: string;
    status: ResumeStatus;
    storage_path: string;
    original_filename: string;
    byte_size: number;
    created_at: string;
    updated_at: string;
    username: string | null;
    owner_email: string | null;
    owner_name: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    ownerEmail: row.owner_email,
    ownerName: row.owner_name,
    displayName: row.display_name,
    status: row.status,
    originalFilename: row.original_filename,
    byteSize: row.byte_size,
    fileExists: Boolean(row.storage_path && fs.existsSync(row.storage_path)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
