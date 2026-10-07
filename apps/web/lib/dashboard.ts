import "server-only";

import { getAppDb } from "@/lib/app-db";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/application-status";
import { listApplications, type ApplicationRecord } from "@/lib/applications";
import { listCoverLetters } from "@/lib/cover-letters";
import { listFollowUps, type FollowUpRecord } from "@/lib/follow-ups";
import { countJobs } from "@/lib/jobs";
import { listPeople } from "@/lib/people";
import { countUsableResumes, listResumes } from "@/lib/resumes";

export type StatusCount = {
  status: ApplicationStatus;
  label: string;
  count: number;
};

export type DashboardFocusItem = {
  id: string;
  title: string;
  blurb: string;
  href: string;
  tone: "primary" | "muted" | "warn";
};

export type DashboardSnapshot = {
  statusCounts: StatusCount[];
  /** Highlight chips for the grid (non-zero preference + key pipeline stages). */
  highlightCounts: StatusCount[];
  activeApplicationCount: number;
  archivedApplicationCount: number;
  pendingFollowUpCount: number;
  dueSoonFollowUpCount: number;
  overdueFollowUpCount: number;
  resumeCount: number;
  coverLetterCount: number;
  peopleCount: number;
  activeResumeName: string | null;
  jobCount: number;
  recentApplications: ApplicationRecord[];
  upcomingFollowUps: FollowUpRecord[];
  focusItems: DashboardFocusItem[];
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

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getDashboardSnapshot(userId: string): Promise<DashboardSnapshot> {
  const db = await getAppDb();

  const statusRows = await db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM applications
       WHERE user_id = ? AND status != 'archived'
       GROUP BY status`,
    )
    .all<{ status: string; count: number }>(userId);

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

  const archivedRow = await db
    .prepare(`SELECT COUNT(*) AS count FROM applications WHERE user_id = ? AND status = 'archived'`)
    .get<{ count: number }>(userId);
  const archivedApplicationCount = Number(archivedRow?.count) || 0;

  const pendingFollowUps = await listFollowUps(userId, { includeClosed: false });
  const pendingFollowUpCount = pendingFollowUps.length;

  const soon = daysFromNowIso(7);
  const todayStart = startOfTodayIso();
  const dueSoonFollowUpCount = pendingFollowUps.filter((f) => {
    if (!f.dueDate) return false;
    return f.dueDate <= soon;
  }).length;
  const overdueFollowUpCount = pendingFollowUps.filter((f) => {
    if (!f.dueDate) return false;
    return f.dueDate < todayStart;
  }).length;

  const resumeCount = await countUsableResumes(userId);
  const coverLetterCount = (await listCoverLetters(userId)).length;
  const peopleCount = (await listPeople(userId)).length;
  const resumes = await listResumes(userId);
  const activeResume = resumes.find((r) => r.status === "active") ?? null;

  const jobCount = await countJobs(userId);

  const recentApplications = (await listApplications(userId, "active"))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const upcomingFollowUps = pendingFollowUps
    .slice()
    .sort((a, b) => {
      const ad = a.dueDate ?? "9999";
      const bd = b.dueDate ?? "9999";
      return ad.localeCompare(bd);
    })
    .slice(0, 5);

  const focusItems: DashboardFocusItem[] = [];
  if (overdueFollowUpCount > 0) {
    focusItems.push({
      id: "overdue",
      title: `${overdueFollowUpCount} overdue follow-up${overdueFollowUpCount === 1 ? "" : "s"}`,
      blurb: "Clear asks that slipped past their due date.",
      href: "/referrals",
      tone: "warn",
    });
  } else if (dueSoonFollowUpCount > 0) {
    focusItems.push({
      id: "due-soon",
      title: `${dueSoonFollowUpCount} follow-up${dueSoonFollowUpCount === 1 ? "" : "s"} due ≤7d`,
      blurb: "Queue or send from Referrals when you are ready.",
      href: "/referrals",
      tone: "primary",
    });
  }

  const preparing = countByStatus.get("preparing") ?? 0;
  const bookmarked = countByStatus.get("bookmarked") ?? 0;
  if (preparing > 0) {
    focusItems.push({
      id: "preparing",
      title: `${preparing} application${preparing === 1 ? "" : "s"} in preparing`,
      blurb: "Finish resumes / cover letters, then move to Applied.",
      href: "/job-tracker",
      tone: "primary",
    });
  } else if (bookmarked > 0) {
    focusItems.push({
      id: "bookmarked",
      title: `${bookmarked} bookmarked role${bookmarked === 1 ? "" : "s"}`,
      blurb: "Promote promising ones into Preparing or Applied.",
      href: "/job-tracker",
      tone: "muted",
    });
  }

  if (jobCount === 0) {
    focusItems.push({
      id: "jobs",
      title: "Discover roles",
      blurb: "Add or seed jobs, then bookmark into your tracker.",
      href: "/jobs",
      tone: "muted",
    });
  } else if (activeApplicationCount === 0) {
    focusItems.push({
      id: "track",
      title: "Start tracking",
      blurb: "Bookmark a job from Jobs to open your pipeline.",
      href: "/jobs",
      tone: "primary",
    });
  }

  if (resumeCount === 0) {
    focusItems.push({
      id: "resume",
      title: "Upload a resume",
      blurb: "PDF resumes power documents and application prep.",
      href: "/documents",
      tone: "muted",
    });
  }

  if (peopleCount === 0 && activeApplicationCount > 0) {
    focusItems.push({
      id: "people",
      title: "Add a warm contact",
      blurb: "People + templates unlock referral follow-ups.",
      href: "/referrals",
      tone: "muted",
    });
  }

  return {
    statusCounts,
    highlightCounts,
    activeApplicationCount,
    archivedApplicationCount,
    pendingFollowUpCount,
    dueSoonFollowUpCount,
    overdueFollowUpCount,
    resumeCount,
    coverLetterCount,
    peopleCount,
    activeResumeName: activeResume?.displayName ?? null,
    jobCount,
    recentApplications,
    upcomingFollowUps,
    focusItems: focusItems.slice(0, 4),
  };
}
