import "server-only";

import fs from "node:fs";

import { getAppDb } from "@/lib/app-db";
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

function countTable(table: string): number {
  const row = getAppDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

export function getAdminOverviewCounts(): AdminOverviewCounts {
  return {
    profiles: countTable("profiles"),
    applications: countTable("applications"),
    resumes: countTable("resumes"),
    people: countTable("people"),
    templates: countTable("templates"),
  };
}

export function listRecentResumesForAdmin(limit = 40): AdminResumeRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT r.id, r.user_id, r.display_name, r.status, r.storage_path, r.original_filename,
              r.byte_size, r.created_at, r.updated_at,
              p.username, p.email AS owner_email, p.name AS owner_name
       FROM resumes r
       LEFT JOIN profiles p ON p.user_id = r.user_id
       ORDER BY r.created_at DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
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
