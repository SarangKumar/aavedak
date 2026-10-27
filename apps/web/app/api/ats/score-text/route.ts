import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { runEngineProfile } from "@/lib/ats-engines/profiles";
import { buildCombinations, getEngine, scoreTypeLabel } from "@/lib/ats-engines/registry";
import type { AtsBatchResultCell, AtsEngineId, EngineRunRequest } from "@/lib/ats-engines/types";
import { normalizeAtsIssues } from "@/lib/ats-types";

const MAX_RESUME_CHARS = 80_000;
const MAX_JD_CHARS = 40_000;
/** Synthetic id so engine logs still have a resumeId without writing a DB row. */
const DRAFT_RESUME_ID = "draft";

function parseYears(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 60
    ? value
    : null;
}

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

/**
 * Score a resume from plain text (resume creator draft) without saving a resume row.
 * Signed-in only — the page gates the ATS pane the same way.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const resumeText = typeof body.resumeText === "string" ? body.resumeText.trim() : "";
  if (resumeText.length < 40) {
    return NextResponse.json(
      { error: "Add more resume content before scoring (at least a few lines)." },
      { status: 400 },
    );
  }
  if (resumeText.length > MAX_RESUME_CHARS) {
    return NextResponse.json({ error: "Resume text is too long." }, { status: 400 });
  }

  const engines = parseEngines(body.engines);
  if (!engines?.length) {
    return NextResponse.json({ error: "Select at least one scoring engine." }, { status: 400 });
  }
  const sharedRole = typeof body.role === "string" ? body.role.trim() : "";
  const sharedJd = typeof body.jdText === "string" ? body.jdText : "";
  if (sharedJd.length > MAX_JD_CHARS) {
    return NextResponse.json({ error: "Job description is too long." }, { status: 400 });
  }

  const yearsExperience = parseYears(body.yearsExperience);
  const combos = buildCombinations({
    resumeIds: [DRAFT_RESUME_ID],
    engines,
    shared: { role: sharedRole, jdText: sharedJd },
  });

  const results: AtsBatchResultCell[] = [];
  for (const combo of combos) {
    const eng = getEngine(combo.engineId);
    if (!eng) continue;
    if (combo.status !== "ready") {
      results.push({
        resumeId: DRAFT_RESUME_ID,
        engineId: combo.engineId,
        status: combo.status === "needs_input" ? "excluded" : "unsupported",
        failureKind: combo.status === "needs_input" ? "missing_input" : "unsupported_mode",
        mode: combo.mode,
        scoreType: combo.scoreType,
        scoreName: scoreTypeLabel(combo.scoreType),
        error: combo.reason || "Combination not runnable.",
        profileVersion: eng.profileVersion,
      });
      continue;
    }
    try {
      const analysis = await runEngineProfile({
        engineId: eng.id,
        resumeId: `${DRAFT_RESUME_ID}_${randomUUID().slice(0, 8)}`,
        resumeText,
        role: combo.role,
        jdText: combo.jdText,
        mode: combo.mode,
        yearsExperience,
      });
      results.push({
        resumeId: DRAFT_RESUME_ID,
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
        engineRuntime: "fastapi",
        profileVersion: eng.profileVersion,
      });
    } catch (err) {
      results.push({
        resumeId: DRAFT_RESUME_ID,
        engineId: eng.id,
        status: "error",
        failureKind: "analysis_failure",
        mode: combo.mode,
        scoreType: combo.scoreType,
        scoreName: scoreTypeLabel(combo.scoreType),
        error: err instanceof Error ? err.message : "Analysis failed.",
        profileVersion: eng.profileVersion,
      });
    }
  }

  return NextResponse.json({ results });
}
