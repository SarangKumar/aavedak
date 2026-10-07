/** Single-enum application statuses (Decision Set 1–2). Not user-extensible. */
export const APPLICATION_STATUSES = [
  "bookmarked",
  "preparing",
  "applied",
  "under_review",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
  "archived",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  bookmarked: "Bookmarked",
  preparing: "Preparing",
  applied: "Applied",
  under_review: "Under review",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
  archived: "Archived",
};

/** Default Kanban majors when not archived-only view (archived is a separate scope). */
export const DEFAULT_KANBAN_STATUSES: ApplicationStatus[] = [
  "bookmarked",
  "preparing",
  "applied",
  "under_review",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
];

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function isArchivedStatus(status: ApplicationStatus): boolean {
  return status === "archived";
}
