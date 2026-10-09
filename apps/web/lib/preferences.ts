import "server-only";

import { ensureAppSchema, getSql } from "@/lib/app-db";
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
  /** Daily job discovery (recommendations from FastAPI). Default on. */
  discoveryEnabled: boolean;
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

export async function getPreferences(userId: string): Promise<UserPreferences> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT user_id, tracker_view, tracker_scope, hidden_columns, discovery_enabled, updated_at
    FROM user_preferences WHERE user_id = ${userId}
  `) as Array<{
    user_id: string;
    tracker_view: string;
    tracker_scope: string;
    hidden_columns: string;
    discovery_enabled: number | null;
    updated_at: string;
  }>;

  const row = rows[0];
  if (!row) {
    return {
      userId,
      trackerView: "kanban",
      trackerScope: "active",
      hiddenColumns: [],
      discoveryEnabled: true,
      updatedAt: new Date(0).toISOString(),
    };
  }

  return {
    userId: row.user_id,
    trackerView: row.tracker_view === "list" ? "list" : "kanban",
    trackerScope: row.tracker_scope === "archived" ? "archived" : "active",
    hiddenColumns: parseHidden(row.hidden_columns),
    discoveryEnabled: row.discovery_enabled !== 0,
    updatedAt: row.updated_at,
  };
}

export async function updatePreferences(
  userId: string,
  patch: Partial<{
    trackerView: TrackerView;
    trackerScope: TrackerScope;
    hiddenColumns: ApplicationStatus[];
    discoveryEnabled: boolean;
  }>,
): Promise<UserPreferences> {
  const current = await getPreferences(userId);
  const next: UserPreferences = {
    userId,
    trackerView: patch.trackerView ?? current.trackerView,
    trackerScope: patch.trackerScope ?? current.trackerScope,
    hiddenColumns: patch.hiddenColumns ?? current.hiddenColumns,
    discoveryEnabled: patch.discoveryEnabled ?? current.discoveryEnabled,
    updatedAt: new Date().toISOString(),
  };

  const hiddenJson = JSON.stringify(next.hiddenColumns);
  const discovery = next.discoveryEnabled ? 1 : 0;
  await getSql()`
    INSERT INTO user_preferences
      (user_id, tracker_view, tracker_scope, hidden_columns, discovery_enabled, updated_at)
    VALUES (${userId}, ${next.trackerView}, ${next.trackerScope}, ${hiddenJson}, ${discovery}, ${next.updatedAt})
    ON CONFLICT (user_id) DO UPDATE SET
      tracker_view = EXCLUDED.tracker_view,
      tracker_scope = EXCLUDED.tracker_scope,
      hidden_columns = EXCLUDED.hidden_columns,
      discovery_enabled = EXCLUDED.discovery_enabled,
      updated_at = EXCLUDED.updated_at
  `;

  return next;
}

export function visibleKanbanStatuses(prefs: UserPreferences): ApplicationStatus[] {
  if (prefs.trackerScope === "archived") return ["archived"];
  const hidden = new Set(prefs.hiddenColumns);
  return DEFAULT_KANBAN_STATUSES.filter((s) => !hidden.has(s));
}
