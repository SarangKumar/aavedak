import { getAppDb } from "@/lib/app-db";
import {
  DEFAULT_KANBAN_STATUSES,
  isApplicationStatus,
  type ApplicationStatus,
} from "@/lib/application-status";

export type TrackerView = "kanban" | "list";
export type TrackerScope = "active" | "archived";

export type UserPreferences = {
  userId: string;
  trackerView: TrackerView;
  trackerScope: TrackerScope;
  hiddenColumns: ApplicationStatus[];
  updatedAt: string;
};

function parseHidden(raw: string): ApplicationStatus[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is ApplicationStatus => typeof v === "string" && isApplicationStatus(v),
    );
  } catch {
    return [];
  }
}

export function getPreferences(userId: string): UserPreferences {
  const row = getAppDb()
    .prepare(
      `SELECT user_id, tracker_view, tracker_scope, hidden_columns, updated_at
       FROM user_preferences WHERE user_id = ?`,
    )
    .get(userId) as
    | {
        user_id: string;
        tracker_view: string;
        tracker_scope: string;
        hidden_columns: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return {
      userId,
      trackerView: "kanban",
      trackerScope: "active",
      hiddenColumns: [],
      updatedAt: new Date(0).toISOString(),
    };
  }

  return {
    userId: row.user_id,
    trackerView: row.tracker_view === "list" ? "list" : "kanban",
    trackerScope: row.tracker_scope === "archived" ? "archived" : "active",
    hiddenColumns: parseHidden(row.hidden_columns),
    updatedAt: row.updated_at,
  };
}

export function updatePreferences(
  userId: string,
  patch: Partial<{
    trackerView: TrackerView;
    trackerScope: TrackerScope;
    hiddenColumns: ApplicationStatus[];
  }>,
): UserPreferences {
  const current = getPreferences(userId);
  const next: UserPreferences = {
    userId,
    trackerView: patch.trackerView ?? current.trackerView,
    trackerScope: patch.trackerScope ?? current.trackerScope,
    hiddenColumns: patch.hiddenColumns ?? current.hiddenColumns,
    updatedAt: new Date().toISOString(),
  };

  getAppDb()
    .prepare(
      `INSERT INTO user_preferences (user_id, tracker_view, tracker_scope, hidden_columns, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         tracker_view = excluded.tracker_view,
         tracker_scope = excluded.tracker_scope,
         hidden_columns = excluded.hidden_columns,
         updated_at = excluded.updated_at`,
    )
    .run(
      userId,
      next.trackerView,
      next.trackerScope,
      JSON.stringify(next.hiddenColumns),
      next.updatedAt,
    );

  return next;
}

export function visibleKanbanStatuses(prefs: UserPreferences): ApplicationStatus[] {
  if (prefs.trackerScope === "archived") return ["archived"];
  const hidden = new Set(prefs.hiddenColumns);
  return DEFAULT_KANBAN_STATUSES.filter((s) => !hidden.has(s));
}
