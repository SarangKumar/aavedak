import "server-only";

import { randomUUID } from "node:crypto";

import { absoluteApiUrl } from "@/lib/api-url";
import { ensureAppSchema, getSql } from "@/lib/app-db";
import { ATS_ENGINES } from "@/lib/ats-engines/registry";
import { AtsServiceUnavailableError } from "@/lib/ats-service";
import type { ImproveResult } from "@/lib/resume-improver-types";
import { createResumeFromPdf, ensureResumeText, getResume, type ResumeRecord } from "@/lib/resumes";

export type ImproveInput = {
  resumeId: string;
  role: string;
  jdText: string;
  yearsExperience: number | null;
  /** null = every safe change; a list = only these change ids. */
  accepted: string[] | null;
};

/** Engines that can score these inputs — the same rule the ATS page uses (JD-only engines need a JD). */
export function improverEngines(jdText: string): string[] {
  const hasJd = jdText.trim().length > 0;
  return ATS_ENGINES.filter((e) => hasJd || e.jd !== "required").map((e) => e.id);
}

/** Run the improver (FastAPI) on a stored resume's extracted text. */
export async function improveResume(userId: string, input: ImproveInput): Promise<ImproveResult> {
  const { text, extractError } = await ensureResumeText(userId, input.resumeId);
  if (!text && extractError) throw new Error(extractError);
  let res: Response;
  try {
    res = await fetch(absoluteApiUrl("/svc/v1/improve"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        resumeText: text,
        role: input.role,
        jdText: input.jdText,
        yearsExperience: input.yearsExperience,
        accepted: input.accepted,
        engines: improverEngines(input.jdText),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new AtsServiceUnavailableError();
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    if (res.status >= 500) throw new AtsServiceUnavailableError();
    throw new Error(typeof data.detail === "string" ? data.detail : "Improve failed.");
  }
  return (await res.json()) as ImproveResult;
}

/**
 * Save an improved revision as a new *inactive* resume linked to the original. The stored text is
 * the canonical revised text the scores were computed on, so later scoring sees the same input.
 */
export async function saveImprovedResume(opts: {
  userId: string;
  sourceResumeId: string;
  displayName: string;
  pdf: File;
  revisedText: string;
  role: string;
  jdText: string;
  yearsExperience: number | null;
  snapshot: unknown;
  beforeScores: unknown;
  afterScores: unknown;
  changes: unknown;
}): Promise<ResumeRecord> {
  await ensureAppSchema();
  const source = await getResume(opts.userId, opts.sourceResumeId);
  if (!source) throw new Error("Resume not found.");
  const created = await createResumeFromPdf({
    userId: opts.userId,
    displayName: opts.displayName,
    file: opts.pdf,
    makeActive: false,
  });
  const now = new Date().toISOString();
  const sql = getSql();
  await sql`
    UPDATE resumes
       SET source_resume_id = ${source.id}, origin = 'improver',
           extracted_text = ${opts.revisedText}, updated_at = ${now}
     WHERE id = ${created.id} AND user_id = ${opts.userId}
  `;
  await sql`
    INSERT INTO resume_improvements
      (id, user_id, source_resume_id, result_resume_id, role, jd_text, years_experience,
       snapshot, before_scores, after_scores, changes, created_at)
    VALUES (
      ${randomUUID()}, ${opts.userId}, ${source.id}, ${created.id}, ${opts.role}, ${opts.jdText},
      ${opts.yearsExperience}, ${JSON.stringify(opts.snapshot)}, ${JSON.stringify(opts.beforeScores)},
      ${JSON.stringify(opts.afterScores)}, ${JSON.stringify(opts.changes)}, ${now}
    )
  `;
  return (await getResume(opts.userId, created.id)) ?? created;
}
