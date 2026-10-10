import "server-only";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/application-status";
import { listApplications, type ApplicationRecord } from "@/lib/applications";
import { listCoverLetters } from "@/lib/cover-letters";
import { listFollowUps, type FollowUpRecord } from "@/lib/follow-ups";
import { countJobs, listDiscoverJobs } from "@/lib/jobs";
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

/** Applications that reached each stage at any point (current status or an earlier event). */
export type DashboardFunnel = {
  applied: number;
  screening: number;
  interview: number;
  offer: number;
  /** Got any reply, including a rejection. */
  heardBack: number;
};

export type DashboardMatch = {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string | null;
  /** Compatibility score 0–100 from discovery ranking. */
  score: number;
  postedAt: string | null;
  postedAtEstimated: boolean;
  firstSeenAt: string | null;
  matchedSkills: string[];
};

export type DashboardStaleApplication = {
  id: string;
  companyName: string;
  role: string;
  status: ApplicationStatus;
  /** Last status change (falls back to applied/updated date for older rows). */
  since: string;
  daysIdle: number;
};

export type DashboardSnapshot = {
  statusCounts: StatusCount[];
  topMatches: DashboardMatch[];
  /** Open recommendations made in the last 7 days. */
  newMatchesThisWeek: number;
  staleApplications: DashboardStaleApplication[];
  staleApplicationCount: number;
  funnel: DashboardFunnel;
  /** Applications logged in the last 7 days / the 7 days before (applied_at, else created_at). */
  addedThisWeek: number;
  addedLastWeek: number;
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

/** Every status at or past "applied" — the application was actually submitted. */
const SUBMITTED_STATUSES = new Set<string>([
  "applied",
  "under_review",
  "assessment",
  "interview",
  "rejected",
  "withdrawn",
  "ghosted",
  "offer",
]);
const SCREENING_STATUSES = new Set<string>(["under_review", "assessment", "interview", "offer"]);
const INTERVIEW_STATUSES = new Set<string>(["interview", "offer"]);

/**
 * Funnel from current status plus status history. History matters: an application that was
 * interviewed and then rejected still counts as having reached the interview stage.
 */
async function getFunnel(userId: string): Promise<DashboardFunnel> {
  const rows = (await getSql()`
    SELECT a.status,
      COALESCE(
        (SELECT array_agg(DISTINCT e.to_status) FROM application_events e
         WHERE e.application_id = a.id AND e.user_id = ${userId}),
        ARRAY[]::text[]
      ) AS reached
    FROM applications a
    WHERE a.user_id = ${userId} AND a.status != 'archived'
  `) as Array<{ status: string; reached: string[] | null }>;

  const funnel: DashboardFunnel = {
    applied: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    heardBack: 0,
  };
  for (const row of rows) {
    const reached = new Set([row.status, ...(row.reached ?? [])]);
    const any = (set: Set<string>) => [...reached].some((s) => set.has(s));
    if (!any(SUBMITTED_STATUSES)) continue;
    funnel.applied += 1;
    const screened = any(SCREENING_STATUSES);
    if (screened) funnel.screening += 1;
    if (any(INTERVIEW_STATUSES)) funnel.interview += 1;
    if (reached.has("offer")) funnel.offer += 1;
    if (screened || reached.has("rejected")) funnel.heardBack += 1;
  }
  return funnel;
}

/** An application sitting in one of these statuses this long probably needs its status updated. */
export const STALE_AFTER_DAYS = 14;
const WAITING_STATUSES = ["applied", "under_review", "assessment", "interview"];

async function getStaleApplications(
  userId: string,
): Promise<{ items: DashboardStaleApplication[]; total: number }> {
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000).toISOString();
  const rows = (await getSql()`
    SELECT id, company_name, role, status,
      COALESCE(status_changed_at, applied_at, updated_at) AS since
    FROM applications
    WHERE user_id = ${userId}
      AND status = ANY(${WAITING_STATUSES})
      AND COALESCE(status_changed_at, applied_at, updated_at) < ${cutoff}
    ORDER BY since ASC
  `) as Array<{ id: string; company_name: string; role: string; status: string; since: string }>;

  const now = Date.now();
  const items = rows.slice(0, 5).map((row) => ({
    id: row.id,
    companyName: row.company_name,
    role: row.role,
    status: row.status as ApplicationStatus,
    since: row.since,
    daysIdle: Math.max(0, Math.floor((now - new Date(row.since).getTime()) / 86_400_000)),
  }));
  return { items, total: rows.length };
}

/** Best open recommendations first; manual jobs have no score and are left out. */
async function getTopMatches(
  userId: string,
): Promise<{ items: DashboardMatch[]; newThisWeek: number }> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const recommended = (await listDiscoverJobs(userId)).filter(
    (job) => job.recommendationScore !== null,
  );
  const newThisWeek = recommended.filter(
    (job) => job.recommendedAt !== null && job.recommendedAt >= weekAgo,
  ).length;
  const items = recommended
    .slice()
    .sort(
      (a, b) =>
        (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0) ||
        (b.recommendedAt ?? "").localeCompare(a.recommendedAt ?? ""),
    )
    .slice(0, 5)
    .map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      score: Math.round(job.recommendationScore ?? 0),
      postedAt: job.postedAt,
      postedAtEstimated: job.postedAtEstimated,
      firstSeenAt: job.firstSeenAt,
      matchedSkills: Array.isArray(job.reasons.skills) ? job.reasons.skills.slice(0, 4) : [],
    }));
  return { items, newThisWeek };
}

/** Same bucketing as the activity chart (lib/application-activity.ts) so the numbers agree. */
async function getWeeklyAdds(userId: string): Promise<{ thisWeek: number; lastWeek: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dayIso = (offset: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const thisStart = dayIso(6);
  const lastStart = dayIso(13);
  const rows = (await getSql()`
    SELECT
      COUNT(*) FILTER (WHERE day >= ${thisStart} AND day <= ${dayIso(0)})::int AS this_week,
      COUNT(*) FILTER (WHERE day >= ${lastStart} AND day < ${thisStart})::int AS last_week
    FROM (
      SELECT COALESCE(
        NULLIF(substring(applied_at, 1, 10), ''),
        substring(created_at, 1, 10)
      ) AS day
      FROM applications
      WHERE user_id = ${userId} AND status != 'archived'
    ) t
  `) as Array<{ this_week: number; last_week: number }>;
  return {
    thisWeek: Number(rows[0]?.this_week) || 0,
    lastWeek: Number(rows[0]?.last_week) || 0,
  };
}

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
  await ensureAppSchema();
  const sql = getSql();

  const statusRows = (await sql`
    SELECT status, COUNT(*)::int AS count
    FROM applications
    WHERE user_id = ${userId} AND status != 'archived'
    GROUP BY status
  `) as Array<{ status: string; count: number }>;

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

  const activeApplicationCount = statusCounts.reduce((sum, s) => sum + s.count, 0);

  const archivedRows = (await sql`
    SELECT COUNT(*)::int AS count FROM applications
    WHERE user_id = ${userId} AND status = 'archived'
  `) as Array<{ count: number }>;
  const archivedApplicationCount = Number(archivedRows[0]?.count) || 0;

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
  const peopleCount = (await listPeople()).length;
  const resumes = await listResumes(userId);
  const activeResume = resumes.find((r) => r.status === "active") ?? null;

  const jobCount = await countJobs(userId);
  const funnel = await getFunnel(userId);
  const weekly = await getWeeklyAdds(userId);
  const matches = await getTopMatches(userId);
  const stale = await getStaleApplications(userId);

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
    topMatches: matches.items,
    newMatchesThisWeek: matches.newThisWeek,
    staleApplications: stale.items,
    staleApplicationCount: stale.total,
    funnel,
    addedThisWeek: weekly.thisWeek,
    addedLastWeek: weekly.lastWeek,
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
