import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { runEngineProfile, runEngineProfileStreamed } from "@/lib/ats-engines/profiles";
import { buildCombinations, getEngine, scoreTypeLabel } from "@/lib/ats-engines/registry";
import type {
  AnalysisCombination,
  AtsBatchResultCell,
  AtsEngineId,
  AtsRunEvent,
  AtsStage,
  EngineCapability,
  EngineRunRequest,
} from "@/lib/ats-engines/types";
import { normalizeAtsIssues } from "@/lib/ats-types";
import { ensureResumeText, getResume } from "@/lib/resumes";

const MAX_JD_CHARS = 40_000;

type Prepared =
  | { kind: "cell"; cell: AtsBatchResultCell; status?: number }
  | { kind: "ready"; combo: AnalysisCombination; eng: EngineCapability; text: string };

function failureCell(
  base: {
    resumeId: string;
    engineId: AtsEngineId;
    combo?: AnalysisCombination;
    eng?: EngineCapability;
  },
  status: AtsBatchResultCell["status"],
  failureKind: AtsBatchResultCell["failureKind"],
  error: string,
): AtsBatchResultCell {
  return {
    resumeId: base.resumeId,
    engineId: base.engineId,
    status,
    failureKind,
    mode: base.combo?.mode,
    scoreType: base.combo?.scoreType,
    scoreName: base.combo ? scoreTypeLabel(base.combo.scoreType) : undefined,
    error,
    profileVersion: base.eng?.profileVersion,
    stage: status === "error" ? "failed" : undefined,
  };
}

/** Shared validation + resume text extraction for the JSON and streaming responses. */
async function prepare(
  userId: string,
  body: Record<string, unknown>,
  onStage?: (stage: AtsStage) => void,
): Promise<Prepared | { kind: "bad_request"; error: string; status: number }> {
  const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
  const engineId = typeof body.engineId === "string" ? body.engineId : "";
  if (!resumeId || !getEngine(engineId)) {
    return {
      kind: "bad_request",
      error: "resumeId and a valid engineId are required.",
      status: 400,
    };
  }
  const engReq: EngineRunRequest = {
    engineId: engineId as AtsEngineId,
    mode:
      body.mode === "resume_only" || body.mode === "role_match" || body.mode === "job_match"
        ? body.mode
        : undefined,
    role: typeof body.role === "string" ? body.role : undefined,
    jdText: typeof body.jdText === "string" ? body.jdText : undefined,
  };
  const sharedRole = typeof body.sharedRole === "string" ? body.sharedRole.trim() : "";
  const sharedJd = typeof body.sharedJdText === "string" ? body.sharedJdText : "";
  if (sharedJd.length > MAX_JD_CHARS || (engReq.jdText?.length ?? 0) > MAX_JD_CHARS) {
    return { kind: "bad_request", error: "Job description is too long.", status: 400 };
  }

  onStage?.("validating_input");
  const resume = await getResume(userId, resumeId);
  if (!resume) return { kind: "bad_request", error: "Resume not found.", status: 404 };

  const [combo] = buildCombinations({
    resumeIds: [resumeId],
    engines: [engReq],
    shared: { role: sharedRole, jdText: sharedJd },
  });
  const eng = getEngine(engineId)!;
  const base = { resumeId, engineId: eng.id, combo, eng };

  if (!combo || combo.status !== "ready") {
    const needs = combo?.status === "needs_input";
    return {
      kind: "cell",
      cell: failureCell(
        base,
        needs ? "excluded" : "unsupported",
        needs ? "missing_input" : "unsupported_mode",
        combo?.reason || "Combination not runnable.",
      ),
    };
  }

  onStage?.("parsing_resume");
  try {
    const ensured = await ensureResumeText(userId, resumeId, { force: body.forceExtract === true });
    const text = ensured.text.trim();
    if (text.length < 40) {
      return {
        kind: "cell",
        cell: failureCell(
          base,
          "error",
          "parsing_failure",
          ensured.extractError ||
            "Could not extract readable text from this PDF. Re-upload a text-based resume on Documents.",
        ),
      };
    }
    return { kind: "ready", combo, eng, text };
  } catch (err) {
    return {
      kind: "cell",
      cell: failureCell(
        base,
        "error",
        "parsing_failure",
        err instanceof Error ? err.message : "Could not read resume PDF.",
      ),
    };
  }
}

/**
 * Run a single resume × engine combination (for progressive UI updates).
 * `stream: true` returns NDJSON stage events followed by one result event (see AtsRunEvent).
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const userId = authResult.user.id;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.stream === true) return streamRun(request, userId, body);

  const prepared = await prepare(userId, body);
  if (prepared.kind === "bad_request") {
    return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  }
  if (prepared.kind === "cell") return NextResponse.json({ result: prepared.cell });

  const { combo, eng, text } = prepared;
  try {
    const analysis = await runEngineProfile({
      engineId: eng.id,
      resumeId: combo.resumeId,
      resumeText: text,
      role: combo.role,
      jdText: combo.jdText,
      mode: combo.mode,
    });
    const result: AtsBatchResultCell = {
      resumeId: combo.resumeId,
      engineId: eng.id,
      status: analysis.error ? "error" : "done",
      failureKind: analysis.error ? "analysis_failure" : undefined,
      mode: analysis.mode ?? combo.mode,
      scoreType: combo.scoreType,
      scoreName: analysis.scoreName || scoreTypeLabel(combo.scoreType),
      overallScore: analysis.error ? null : analysis.overallScore,
      scoreLabel: analysis.scoreLabel,
      analysis: { ...analysis, atsIssues: normalizeAtsIssues(analysis.atsIssues) },
      error: analysis.error,
      engineRuntime:
        analysis.engine === "fastapi" ? "fastapi" : eng.id === "aavedak" ? "fallback" : "reference",
      profileVersion: eng.profileVersion,
    };
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({
      result: failureCell(
        { resumeId: combo.resumeId, engineId: eng.id, combo, eng },
        "error",
        "analysis_failure",
        err instanceof Error ? err.message : "Analysis failed.",
      ),
    });
  }
}

function streamRun(request: Request, userId: string, body: Record<string, unknown>) {
  const runId = typeof body.runId === "string" && body.runId ? body.runId : randomUUID();
  const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
  const engineId = (typeof body.engineId === "string" ? body.engineId : "") as AtsEngineId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // This route owns `seq` for the client; upstream FastAPI seq is validated in ats-service.
      let seq = 0;
      let lastStage: AtsStage | undefined;
      const send = (ev: AtsRunEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`));
      const stage = (s: AtsStage, message?: string, at = new Date().toISOString()) => {
        if (s === lastStage) return; // e.g. text extraction then FastAPI text parsing → one "Parsing Resume"
        lastStage = s;
        send({ type: "stage", resumeId, engineId, runId, seq: ++seq, stage: s, message, at });
      };
      const finish = (result: AtsBatchResultCell) => {
        send({ type: "result", runId, seq: ++seq, result: { ...result, runId, seq } });
        controller.close();
      };

      try {
        const prepared = await prepare(userId, body, (s) => stage(s));
        if (prepared.kind === "bad_request") {
          finish(failureCell({ resumeId, engineId }, "error", "missing_input", prepared.error));
          return;
        }
        if (prepared.kind === "cell") {
          finish(prepared.cell);
          return;
        }
        const { combo, eng, text } = prepared;
        const outcome = await runEngineProfileStreamed(
          {
            engineId: eng.id,
            resumeId: combo.resumeId,
            resumeText: text,
            role: combo.role,
            jdText: combo.jdText,
            mode: combo.mode,
            runId,
            signal: request.signal,
          },
          // Next already validated this combination with the same registry rules.
          (ev) => ev.stage !== "validating_input" && stage(ev.stage, ev.message, ev.at),
        );
        const base = { resumeId: combo.resumeId, engineId: eng.id, combo, eng };
        if (outcome.kind === "failed") {
          finish(failureCell(base, "error", outcome.failureKind, outcome.message));
          return;
        }
        const { analysis } = outcome;
        finish({
          resumeId: combo.resumeId,
          engineId: eng.id,
          status: "done",
          stage: outcome.stage,
          mode: analysis.mode ?? combo.mode,
          scoreType: combo.scoreType,
          scoreName: analysis.scoreName || scoreTypeLabel(combo.scoreType),
          overallScore: analysis.overallScore,
          scoreLabel: analysis.scoreLabel,
          analysis: { ...analysis, atsIssues: normalizeAtsIssues(analysis.atsIssues) },
          engineRuntime: outcome.runtime,
          profileVersion: eng.profileVersion,
        });
      } catch (err) {
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        finish(
          failureCell(
            { resumeId, engineId },
            "error",
            "analysis_failure",
            err instanceof Error ? err.message : "Analysis failed.",
          ),
        );
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
