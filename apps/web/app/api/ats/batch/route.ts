import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { runEngineProfile } from "@/lib/ats-engines/profiles";
import {
  buildCombinations,
  getEngine,
  scoreTypeLabel,
  summarizeCombinations,
} from "@/lib/ats-engines/registry";
import type { AtsBatchResultCell, AtsEngineId, EngineRunRequest } from "@/lib/ats-engines/types";
import { normalizeAtsIssues } from "@/lib/ats-types";
import { ensureResumeText, getResume } from "@/lib/resumes";

const MAX_RESUMES = 12;
const MAX_ENGINES = 10;
const MAX_JD_CHARS = 40_000;

type Body = {
  resumeIds?: unknown;
  engines?: unknown;
  shared?: { role?: unknown; jdText?: unknown };
  forceExtract?: unknown;
  dryRun?: unknown;
};

function parseEngines(raw: unknown): EngineRunRequest[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: EngineRunRequest[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    if (typeof r.engineId !== "string" || !getEngine(r.engineId)) return null;
    out.push({
      engineId: r.engineId as AtsEngineId,
      mode:
        r.mode === "resume_only" || r.mode === "role_match" || r.mode === "job_match"
          ? r.mode
          : undefined,
      role: typeof r.role === "string" ? r.role : undefined,
      jdText: typeof r.jdText === "string" ? r.jdText : undefined,
    });
  }
  return out;
}

export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const userId = authResult.user.id;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const resumeIds = Array.isArray(body.resumeIds)
    ? body.resumeIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const engines = parseEngines(body.engines);
  if (!resumeIds.length) {
    return NextResponse.json({ error: "Select at least one resume." }, { status: 400 });
  }
  if (!engines?.length) {
    return NextResponse.json({ error: "Select at least one scoring engine." }, { status: 400 });
  }
  if (resumeIds.length > MAX_RESUMES) {
    return NextResponse.json({ error: `At most ${MAX_RESUMES} resumes per run.` }, { status: 400 });
  }
  if (engines.length > MAX_ENGINES) {
    return NextResponse.json({ error: `At most ${MAX_ENGINES} engines per run.` }, { status: 400 });
  }

  const sharedRole = typeof body.shared?.role === "string" ? body.shared.role.trim() : "";
  const sharedJd = typeof body.shared?.jdText === "string" ? body.shared.jdText : "";
  if (sharedJd.length > MAX_JD_CHARS) {
    return NextResponse.json({ error: "Job description is too long." }, { status: 400 });
  }

  // Ownership: every ID must belong to the authenticated user
  const owned: string[] = [];
  for (const id of resumeIds) {
    const resume = await getResume(userId, id);
    if (!resume) {
      return NextResponse.json({ error: `Resume not found: ${id}` }, { status: 404 });
    }
    owned.push(id);
  }

  const combos = buildCombinations({
    resumeIds: owned,
    engines,
    shared: { role: sharedRole, jdText: sharedJd },
  });
  const summary = summarizeCombinations(combos);

  if (body.dryRun === true) {
    return NextResponse.json({
      batchId: null,
      dryRun: true,
      summary: {
        resumes: owned.length,
        engines: engines.length,
        combinations: summary.total,
        ready: summary.readyCount,
        needsInput: summary.needsCount,
        unsupported: summary.unsupportedCount,
      },
      combinations: combos,
    });
  }

  const batchId = randomUUID();
  const forceExtract = body.forceExtract === true;
  const results: AtsBatchResultCell[] = [];

  // Prefetch text once per resume
  const textByResume = new Map<string, { text: string; error?: string }>();
  for (const id of owned) {
    try {
      const ensured = await ensureResumeText(userId, id, { force: forceExtract });
      if (!ensured.text.trim() || ensured.text.trim().length < 40) {
        textByResume.set(id, {
          text: "",
          error:
            ensured.extractError ||
            "Could not extract readable text from this PDF. Re-upload a text-based resume on Documents.",
        });
      } else {
        textByResume.set(id, { text: ensured.text });
      }
    } catch (err) {
      textByResume.set(id, {
        text: "",
        error: err instanceof Error ? err.message : "Could not read resume PDF.",
      });
    }
  }

  for (const combo of combos) {
    const eng = getEngine(combo.engineId);
    if (combo.status !== "ready" || !eng) {
      results.push({
        resumeId: combo.resumeId,
        engineId: combo.engineId,
        status: combo.status === "needs_input" ? "excluded" : "unsupported",
        mode: combo.mode,
        scoreType: combo.scoreType,
        scoreName: scoreTypeLabel(combo.scoreType),
        error: combo.reason || "Combination not runnable.",
        profileVersion: eng?.profileVersion,
      });
      continue;
    }

    const packed = textByResume.get(combo.resumeId);
    if (!packed?.text) {
      results.push({
        resumeId: combo.resumeId,
        engineId: combo.engineId,
        status: "error",
        mode: combo.mode,
        scoreType: combo.scoreType,
        scoreName: scoreTypeLabel(combo.scoreType),
        error: packed?.error || "Empty resume text.",
        profileVersion: eng.profileVersion,
      });
      continue;
    }

    try {
      const analysis = await runEngineProfile({
        engineId: combo.engineId,
        resumeId: combo.resumeId,
        resumeText: packed.text,
        role: combo.role,
        jdText: combo.jdText,
        mode: combo.mode,
      });
      const normalized = {
        ...analysis,
        atsIssues: normalizeAtsIssues(analysis.atsIssues),
      };
      results.push({
        resumeId: combo.resumeId,
        engineId: combo.engineId,
        status: analysis.error ? "error" : "done",
        mode: analysis.mode ?? combo.mode,
        scoreType: combo.scoreType,
        scoreName: analysis.scoreName || scoreTypeLabel(combo.scoreType),
        overallScore: analysis.error ? null : analysis.overallScore,
        scoreLabel: analysis.scoreLabel,
        analysis: normalized,
        error: analysis.error,
        engineRuntime:
          analysis.engine === "fastapi"
            ? "fastapi"
            : combo.engineId === "aavedak"
              ? "fallback"
              : "reference",
        profileVersion: eng.profileVersion,
      });
    } catch (err) {
      results.push({
        resumeId: combo.resumeId,
        engineId: combo.engineId,
        status: "error",
        mode: combo.mode,
        scoreType: combo.scoreType,
        scoreName: scoreTypeLabel(combo.scoreType),
        error: err instanceof Error ? err.message : "Analysis failed.",
        profileVersion: eng.profileVersion,
      });
    }
  }

  return NextResponse.json({
    batchId,
    summary: {
      resumes: owned.length,
      engines: engines.length,
      combinations: summary.total,
      ready: summary.readyCount,
      needsInput: summary.needsCount,
      unsupported: summary.unsupportedCount,
      completed: results.filter((r) => r.status === "done").length,
      failed: results.filter((r) => r.status === "error").length,
    },
    results,
  });
}
