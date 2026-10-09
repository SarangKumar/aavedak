import type { AtsBatchResultCell, AtsFailureKind, AtsStage } from "./types";

/** Concise labels for backend-reported stages. Shown only when the backend reports them. */
export const STAGE_LABELS: Record<AtsStage, string> = {
  queued: "Queued",
  validating_input: "Validating Input",
  parsing_resume: "Parsing Resume",
  parsing_job_description: "Parsing Job Description",
  extracting_skills: "Extracting Skills",
  analyzing_content: "Analyzing Content",
  matching_keywords: "Matching Keywords",
  calculating_score: "Calculating Score",
  generating_report: "Generating Report",
  completed: "Completed",
  completed_with_warnings: "Completed · warnings",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const FAILURE_LABELS: Record<AtsFailureKind, string> = {
  unsupported_mode: "Unsupported mode",
  missing_input: "Needs input",
  parsing_failure: "Parsing failed",
  analysis_failure: "Analysis failed",
  service_unavailable: "Service unavailable",
};

const TERMINAL = new Set<AtsBatchResultCell["status"]>([
  "done",
  "error",
  "unsupported",
  "excluded",
  "cancelled",
]);

export function isTerminalCell(cell: AtsBatchResultCell | undefined): boolean {
  return Boolean(cell && TERMINAL.has(cell.status));
}

export function isAtsStage(value: unknown): value is AtsStage {
  return typeof value === "string" && value in STAGE_LABELS;
}

/**
 * Merge an incoming update into the current cell for the same resume × engine.
 * - Updates from a different run than the cell's current run are stale and dropped.
 * - Within one run, lower/equal `seq` is out of order and dropped.
 * - Once terminal (including cancelled), a cell is final for that run.
 * A new run (different runId with status queued/running) always replaces the cell.
 */
export function applyCellUpdate(
  prev: AtsBatchResultCell | undefined,
  next: AtsBatchResultCell,
  activeRunId?: string,
): AtsBatchResultCell {
  if (!prev) return next;
  if (activeRunId && next.runId && next.runId !== activeRunId) return prev;
  if (prev.runId && next.runId && prev.runId === next.runId) {
    if (isTerminalCell(prev)) return prev;
    if (prev.seq != null && next.seq != null && next.seq <= prev.seq && !isTerminalCell(next))
      return prev;
  }
  return next;
}

export type CellDisplay = {
  /** Short label for the table cell. */
  label: string;
  tone: "muted" | "progress" | "score" | "warning" | "destructive";
  /** Tooltip / detail reason. */
  title?: string;
};

/** Pure mapping from cell state to what the table shows (tested in run-tests.ts). */
export function cellDisplay(cell: AtsBatchResultCell | undefined): CellDisplay {
  if (!cell || cell.status === "idle") return { label: "Ready", tone: "muted" };
  if (cell.status === "queued") return { label: STAGE_LABELS.queued, tone: "muted" };
  if (cell.status === "running") {
    // Before the first backend stage arrives, say only that the request is out — not a fake stage.
    return { label: cell.stage ? STAGE_LABELS[cell.stage] : "Starting…", tone: "progress" };
  }
  if (cell.status === "done") {
    if (cell.overallScore == null) return { label: "No score", tone: "muted", title: cell.error };
    return {
      label: cell.stage === "completed_with_warnings" ? STAGE_LABELS.completed_with_warnings : "",
      tone: cell.stage === "completed_with_warnings" ? "warning" : "score",
    };
  }
  if (cell.status === "cancelled") return { label: STAGE_LABELS.cancelled, tone: "muted" };
  if (cell.status === "excluded") {
    return { label: FAILURE_LABELS.missing_input, tone: "warning", title: cell.error };
  }
  if (cell.status === "unsupported") {
    return { label: FAILURE_LABELS.unsupported_mode, tone: "muted", title: cell.error };
  }
  return {
    label: cell.failureKind ? FAILURE_LABELS[cell.failureKind] : STAGE_LABELS.failed,
    tone: cell.failureKind === "missing_input" ? "warning" : "destructive",
    title: cell.error,
  };
}
