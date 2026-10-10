import "server-only";

import { absoluteApiUrl } from "@/lib/api-url";
import { isAtsStage } from "@/lib/ats-engines/stages";
import type { AtsFailureKind, AtsStage } from "@/lib/ats-engines/types";
import { normalizeAtsIssues, type AtsAnalysis } from "@/lib/ats-types";

export type { AtsAnalysis } from "@/lib/ats-types";

/** All ATS scoring runs in FastAPI; there is no local fallback. */
export const SERVICE_UNAVAILABLE_MESSAGE =
  process.env.NODE_ENV === "development"
    ? "Scoring service is not reachable. Start it with `pnpm dev:api` (FastAPI on :8000)."
    : "Scoring service is unavailable right now. Try again shortly.";

export class AtsServiceUnavailableError extends Error {
  constructor(message = SERVICE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "AtsServiceUnavailableError";
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(absoluteApiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asObjectArray<T extends object>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => Boolean(item) && typeof item === "object");
}

/** Ensure Flight/JSON payloads always have the arrays the UI reads with `.length` / `.map`. */
function normalizeAnalysis(row: AtsAnalysis, engine: "fastapi"): AtsAnalysis {
  return {
    ...row,
    overallScore: typeof row.overallScore === "number" ? row.overallScore : (row.atsScore ?? 0),
    scoreLabel: typeof row.scoreLabel === "string" ? row.scoreLabel : "",
    scoreName: typeof row.scoreName === "string" ? row.scoreName : "Score",
    mode: row.mode === "role_match" || row.mode === "job_match" ? row.mode : "resume_only",
    scores: row.scores && typeof row.scores === "object" ? row.scores : {},
    matchedSkills: asObjectArray(row.matchedSkills),
    partialSkills: asObjectArray(row.partialSkills),
    missingSkills: asObjectArray(row.missingSkills),
    matchedResponsibilities: asObjectArray(row.matchedResponsibilities),
    partialResponsibilities: asObjectArray(row.partialResponsibilities),
    missingResponsibilities: asObjectArray(row.missingResponsibilities),
    strengths: asStringArray(row.strengths),
    improvements: asObjectArray(row.improvements),
    atsIssues: normalizeAtsIssues(row.atsIssues),
    notes: asStringArray(row.notes),
    breakdown: row.breakdown ? asObjectArray(row.breakdown) : undefined,
    findings: row.findings ? asObjectArray(row.findings) : undefined,
    metrics: row.metrics ? asObjectArray(row.metrics) : undefined,
    skillCategories: row.skillCategories ? asObjectArray(row.skillCategories) : undefined,
    limitations: row.limitations ? asStringArray(row.limitations) : undefined,
    warnings: row.warnings ? asStringArray(row.warnings) : undefined,
    confidence: row.confidence === "high" || row.confidence === "low" ? row.confidence : "medium",
    engine,
  };
}

export async function analyzeEngineViaService(input: {
  engineId: string;
  resumeId?: string;
  resumeText: string;
  jdText?: string;
  role?: string;
  mode?: string;
}): Promise<AtsAnalysis | null> {
  const remote = await postJson<AtsAnalysis>("/svc/v1/ats/score-engine", {
    engineId: input.engineId,
    resumeId: input.resumeId ?? "",
    resumeText: input.resumeText,
    jdText: input.jdText ?? "",
    role: input.role ?? "",
    mode: input.mode,
  });
  if (remote && typeof remote.overallScore === "number") {
    return normalizeAnalysis({ ...remote, resumeId: input.resumeId || remote.resumeId }, "fastapi");
  }
  return null;
}

export type ServiceStageEvent = { stage: AtsStage; message?: string; at: string; seq: number };

export type StreamedEngineOutcome =
  | { kind: "result"; analysis: AtsAnalysis; stage: "completed" | "completed_with_warnings" }
  | { kind: "failed"; failureKind: AtsFailureKind; message: string };

const FAILURE_KINDS = new Set<AtsFailureKind>([
  "unsupported_mode",
  "missing_input",
  "parsing_failure",
  "analysis_failure",
]);

/**
 * Stream one engine run from FastAPI (NDJSON). Calls `onStage` as the backend reports each stage.
 * Returns null when the service is unreachable or the stream is malformed (caller reports
 * "Service unavailable").
 */
export async function streamEngineViaService(
  input: {
    engineId: string;
    resumeId: string;
    runId: string;
    resumeText: string;
    jdText?: string;
    role?: string;
    mode?: string;
    signal?: AbortSignal;
  },
  onStage: (event: ServiceStageEvent) => void,
): Promise<StreamedEngineOutcome | null> {
  let res: Response;
  try {
    res = await fetch(absoluteApiUrl("/svc/v1/ats/score-engine/stream"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({
        engineId: input.engineId,
        resumeId: input.resumeId,
        runId: input.runId,
        resumeText: input.resumeText,
        jdText: input.jdText ?? "",
        role: input.role ?? "",
        mode: input.mode,
      }),
      cache: "no-store",
      signal: input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
  if (!res.ok || !res.body) return null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastSeq = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as Record<string, unknown>;
        // Only accept events for this exact combination/run, in order.
        if (ev.runId !== input.runId || ev.engineId !== input.engineId) continue;
        const seq = typeof ev.seq === "number" ? ev.seq : 0;
        if (seq <= lastSeq) continue;
        lastSeq = seq;
        if (ev.type === "stage" && isAtsStage(ev.stage)) {
          onStage({
            stage: ev.stage,
            message: typeof ev.message === "string" ? ev.message : undefined,
            at: typeof ev.at === "string" ? ev.at : new Date().toISOString(),
            seq,
          });
        } else if (ev.type === "result" && ev.result && typeof ev.result === "object") {
          const row = ev.result as AtsAnalysis;
          if (typeof row.overallScore !== "number") return null;
          return {
            kind: "result",
            analysis: normalizeAnalysis({ ...row, resumeId: input.resumeId }, "fastapi"),
            stage: ev.stage === "completed_with_warnings" ? "completed_with_warnings" : "completed",
          };
        } else if (ev.type === "failed") {
          const kind = ev.failureKind as AtsFailureKind;
          return {
            kind: "failed",
            failureKind: FAILURE_KINDS.has(kind) ? kind : "analysis_failure",
            message: typeof ev.message === "string" ? ev.message : "Analysis failed.",
          };
        }
      }
      if (done) break;
    }
  } catch {
    return null;
  }
  return null;
}

/** Native readiness / match score (legacy `/svc/v1/ats/score`). Throws when FastAPI is down. */
export async function analyzeResumeViaService(input: {
  resumeId?: string;
  resumeText: string;
  jdText?: string;
  role?: string;
}): Promise<AtsAnalysis> {
  const remote = await postJson<AtsAnalysis>("/svc/v1/ats/score", {
    resumeText: input.resumeText,
    jdText: input.jdText ?? "",
    role: input.role ?? "",
  });
  if (remote && typeof remote.overallScore === "number") {
    return normalizeAnalysis({ ...remote, resumeId: input.resumeId || remote.resumeId }, "fastapi");
  }
  throw new AtsServiceUnavailableError();
}
