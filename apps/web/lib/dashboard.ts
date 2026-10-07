import "server-only";

import { getAppDb } from "@/lib/app-db";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/application-status";
import { listApplications, type ApplicationRecord } from "@/lib/applications";
import { listFollowUps, type FollowUpRecord } from "@/lib/follow-ups";
import { countJobs } from "@/lib/jobs";
import { countUsableResumes, listResumes } from "@/lib/resumes";

export type StatusCount = {
  status: ApplicationStatus;
  label: string;
  count: number;
};

export type DashboardSnapshot = {
  statusCounts: StatusCount[];
  /** Highlight chips for the grid (non-zero preference + key pipeline stages). */
  highlightCounts: StatusCount[];
  activeApplicationCount: number;
  archivedApplicationCount: number;
  pendingFollowUpCount: number;
  dueSoonFollowUpCount: number;
  resumeCount: number;
  activeResumeName: string | null;
  jobCount: number;
  recentApplications: ApplicationRecord[];
  upcomingFollowUps: FollowUpRecord[];
};

const HIGHLIGHT_STATUSES: ApplicationStatus[] = [
  "bookmarked",
  "applied",
  "interview",
  "offer",
  "rejected",
  "assessment",
];

function daysFromNowIso(days: number): string {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function getDashboardSnapshot(userId: string): DashboardSnapshot {
  const db = getAppDb();

  const statusRows = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM applications
       WHERE user_id = ? AND status != 'archived'
       GROUP BY status`,
    )
    .all(userId) as Array<{ status: string; count: number }>;

  const countByStatus = new Map<ApplicationStatus, number>();
  for (const s of APPLICATION_STATUSES) countByStatus.set(s, 0);
  for (const row of statusRows) {
    if ((APPLICATION_STATUSES as readonly string[]).includes(row.status)) {
      countByStatus.set(row.status as ApplicationStatus, Number(row.count) || 0);
    }
  }

  const statusCounts: StatusCount[] = APPLICATION_STATUSES.filter((s) => s !== "archived").map(
    (status) => ({
      status,
      label: STATUS_LABELS[status],
      count: countByStatus.get(status) ?? 0,
    }),
  );

  const highlightCounts: StatusCount[] = HIGHLIGHT_STATUSES.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: countByStatus.get(status) ?? 0,
  }));

  const activeApplicationCount = statusCounts.reduce((sum, s) => sum + s.count, 0);

  const archivedRow = db
    .prepare(`SELECT COUNT(*) AS count FROM applications WHERE user_id = ? AND status = 'archived'`)
    .get(userId) as { count: number } | undefined;
  const archivedApplicationCount = Number(archivedRow?.count) || 0;

  const pendingFollowUps = listFollowUps(userId, { includeClosed: false });
  const pendingFollowUpCount = pendingFollowUps.length;

  const soon = daysFromNowIso(7);
  const dueSoonFollowUpCount = pendingFollowUps.filter((f) => {
    if (!f.dueDate) return false;
    return f.dueDate <= soon;
  }).length;

  const resumeCount = countUsableResumes(userId);
  const resumes = listResumes(userId);
  const activeResume = resumes.find((r) => r.status === "active") ?? null;

  const jobCount = countJobs(userId);

  const recentApplications = listApplications(userId, "active")
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const upcomingFollowUps = pendingFollowUps.slice(0, 5);

  return {
    statusCounts,
    highlightCounts,
    activeApplicationCount,
    archivedApplicationCount,
    pendingFollowUpCount,
    dueSoonFollowUpCount,
    resumeCount,
    activeResumeName: activeResume?.displayName ?? null,
    jobCount,
    recentApplications,
    upcomingFollowUps,
  };
}
