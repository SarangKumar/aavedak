import "server-only";

import fs from "node:fs";
import path from "node:path";

import { createApplication, hasApplicationOnDay, type ApplicationRecord } from "@/lib/applications";
import type { ApplicationStatus } from "@/lib/application-status";

export type BulkSeedItem = {
  company_name: string;
  role: string;
  location: string;
  status: ApplicationStatus;
  salary_ctc?: string | null;
  job_link?: string | null;
  job_id?: string | null;
  notes?: string | null;
  applied_at?: string | null;
};

function loadBulkSeedItems(): BulkSeedItem[] {
  const candidates = [
    path.join(process.cwd(), "public/sample/applications-bulk-seed.json"),
    path.join(process.cwd(), "apps/web/public/sample/applications-bulk-seed.json"),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
        applications?: BulkSeedItem[];
      };
      if (Array.isArray(raw.applications)) return raw.applications;
    } catch {
      /* try next */
    }
  }
  return [];
}

/** Upsert bulk applications by company+role+applied calendar day. */
export function seedBulkApplications(userId: string): {
  inserted: ApplicationRecord[];
  skipped: number;
  appliedInserted: number;
  rejectedInserted: number;
  totalSource: number;
} {
  const items = loadBulkSeedItems();
  const inserted: ApplicationRecord[] = [];
  let skipped = 0;
  let appliedInserted = 0;
  let rejectedInserted = 0;

  for (const item of items) {
    const company = item.company_name?.trim();
    const role = item.role?.trim() || "Unknown";
    if (!company) {
      skipped += 1;
      continue;
    }
    if (hasApplicationOnDay(userId, company, role, item.applied_at ?? null)) {
      skipped += 1;
      continue;
    }

    const status: ApplicationStatus = item.status === "rejected" ? "rejected" : "applied";
    const created = createApplication(userId, {
      companyName: company,
      role,
      location: item.location?.trim() || "Unknown",
      status,
      salaryCtc: item.salary_ctc ?? null,
      jobLink: item.job_link ?? null,
      jobId: item.job_id ?? null,
      notes: item.notes ?? null,
      appliedAt: item.applied_at ?? null,
      createdAt: item.applied_at ?? null,
    });
    inserted.push(created);
    if (status === "rejected") rejectedInserted += 1;
    else appliedInserted += 1;
  }

  return {
    inserted,
    skipped,
    appliedInserted,
    rejectedInserted,
    totalSource: items.length,
  };
}
