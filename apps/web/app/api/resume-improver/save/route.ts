import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { saveImprovedResume } from "@/lib/resume-improver";

function parseJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Save the improved revision (client-rendered PDF + canonical text) as a new inactive resume. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const form = await request.formData();
  const pdf = form.get("file");
  const meta = parseJson(form.get("meta")) as Record<string, unknown> | null;
  if (!(pdf instanceof File) || !meta) {
    return NextResponse.json({ error: "Missing file or details." }, { status: 400 });
  }
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : "");
  if (!str("sourceResumeId") || !str("revisedText") || !str("role")) {
    return NextResponse.json({ error: "Missing details." }, { status: 400 });
  }
  try {
    const resume = await saveImprovedResume({
      userId: auth.user.id,
      sourceResumeId: str("sourceResumeId"),
      displayName: str("displayName"),
      pdf,
      revisedText: str("revisedText"),
      role: str("role"),
      jdText: str("jdText"),
      yearsExperience: typeof meta.yearsExperience === "number" ? meta.yearsExperience : null,
      snapshot: meta.snapshot ?? {},
      beforeScores: meta.beforeScores ?? {},
      afterScores: meta.afterScores ?? {},
      changes: meta.changes ?? [],
    });
    return NextResponse.json({ resume: { id: resume.id, displayName: resume.displayName } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed." },
      { status: 400 },
    );
  }
}
