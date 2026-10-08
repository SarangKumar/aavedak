import "server-only";

import { analyzeResumeFallback } from "@/lib/ats-analyze-fallback";
import { apiUrl, getApiBaseUrl } from "@/lib/api-url";
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

function normalizeAnalysis(row: AtsAnalysis, engine: "fastapi" | "fallback"): AtsAnalysis {
  return {
    ...row,
    overallScore: row.overallScore ?? row.atsScore ?? 0,
    atsIssues: normalizeAtsIssues(row.atsIssues),
    engine,
  };
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
