import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { AtsServiceUnavailableError } from "@/lib/ats-service";
import { improveResume } from "@/lib/resume-improver";

const MAX_JD_CHARS = 40_000;

/** Improve one resume; re-POST with `accepted` ids to re-score a different set of changes. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
  const role = typeof body.role === "string" ? body.role.trim().slice(0, 200) : "";
  const jdText = typeof body.jdText === "string" ? body.jdText.slice(0, MAX_JD_CHARS) : "";
  const years =
    typeof body.yearsExperience === "number" &&
    Number.isFinite(body.yearsExperience) &&
    body.yearsExperience >= 0 &&
    body.yearsExperience <= 60
      ? body.yearsExperience
      : null;
  const accepted = Array.isArray(body.accepted)
    ? body.accepted.filter((x): x is string => typeof x === "string")
    : null;
  const engines = Array.isArray(body.engines)
    ? body.engines.filter((x): x is string => typeof x === "string")
    : null;
  if (engines && engines.length === 0) {
    return NextResponse.json({ error: "Select at least one engine." }, { status: 400 });
  }
  if (!resumeId || !role) {
    return NextResponse.json({ error: "Pick a resume and enter a job title." }, { status: 400 });
  }
  try {
    const result = await improveResume(auth.user.id, {
      resumeId,
      role,
      jdText,
      yearsExperience: years,
      accepted,
      engines,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AtsServiceUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Improve failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Resume not found." ? 404 : 400 },
    );
  }
}
