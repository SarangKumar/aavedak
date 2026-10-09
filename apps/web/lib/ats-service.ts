import "server-only";

import { analyzeResumeFallback } from "@/lib/ats-analyze-fallback";
import { apiUrl, getApiBaseUrl } from "@/lib/api-url";
import { isAtsStage } from "@/lib/ats-engines/stages";
import type { AtsFailureKind, AtsStage } from "@/lib/ats-engines/types";
import { normalizeAtsIssues, type AtsAnalysis } from "@/lib/ats-types";

export type { AtsAnalysis } from "@/lib/ats-types";

function absoluteApiUrl(path: string): string {
  const joined = apiUrl(path);
  if (joined.startsWith("http://") || joined.startsWith("https://")) return joined;

  const app =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (app) {
    const base = getApiBaseUrl().startsWith("http")
      ? getApiBaseUrl()
      : `${app}${getApiBaseUrl().startsWith("/") ? "" : "/"}${getApiBaseUrl()}`;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    if (suffix.startsWith("/svc")) return `${app}${suffix}`;
    return `${base.replace(/\/$/, "")}${suffix}`;
  }

  return `http://127.0.0.1:8000${path.startsWith("/") ? path : `/${path}`}`;
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
function normalizeAnalysis(row: AtsAnalysis, engine: "fastapi" | "fallback"): AtsAnalysis {
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
 * Returns null when the service is unreachable or the stream is malformed (caller decides fallback).
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
  return analyzeResumeFallback({
    resumeId: input.resumeId || "",
    resumeText: input.resumeText,
    jdText: input.jdText,
    role: input.role,
  });
}

export async function analyzeResumesBatchViaService(input: {
  resumes: Array<{ id: string; text: string }>;
  jdText?: string;
  role?: string;
}): Promise<{ results: AtsAnalysis[]; engine: "fastapi" | "fallback"; mode?: string }> {
  const remote = await postJson<{ results: AtsAnalysis[]; engine?: string; mode?: string }>(
    "/svc/v1/ats/score-batch",
    {
      jdText: input.jdText ?? "",
      role: input.role ?? "",
      resumes: input.resumes,
    },
  );
  if (remote?.results?.length) {
    return {
      results: remote.results.map((row) => normalizeAnalysis(row, "fastapi")),
      engine: "fastapi",
      mode: remote.mode,
    };
  }

  const results = input.resumes.map((resume) =>
    analyzeResumeFallback({
      resumeId: resume.id,
      resumeText: resume.text,
      jdText: input.jdText,
      role: input.role,
    }),
  );
  return { results, engine: "fallback" };
}
