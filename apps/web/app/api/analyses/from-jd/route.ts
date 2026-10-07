import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createCoverLetter } from "@/lib/cover-letters";
import { databaseErrorMessage, isDatabaseFailure } from "@/lib/db-config";
import { createJobAnalysis } from "@/lib/job-analyses";
import { draftCoverFromJd, extractPdfText, scoreResumeAgainstJd } from "@/lib/match-score";
import { ensureProfile } from "@/lib/profile";
import { getActiveResume } from "@/lib/resumes";

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureProfile({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });

    const contentType = request.headers.get("content-type") ?? "";
    let rawText = "";
    let companyName = "";
    let role = "";
    let jobId: string | null = null;
    let applicationId: string | null = null;
    let saveCover = false;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      companyName = String(form.get("companyName") ?? "");
      role = String(form.get("role") ?? "");
      jobId = String(form.get("jobId") ?? "") || null;
      applicationId = String(form.get("applicationId") ?? "") || null;
      saveCover = String(form.get("saveCover") ?? "") === "1" || form.get("saveCover") === "true";
      const file = form.get("file");
      const pasted = String(form.get("rawText") ?? "");
      if (file instanceof File) {
        const bytes = Buffer.from(await file.arrayBuffer());
        rawText =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
            ? extractPdfText(bytes)
            : bytes.toString("utf8");
      }
      rawText = rawText.trim() || pasted.trim();
    } else {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      rawText = String(body?.rawText ?? "");
      companyName = String(body?.companyName ?? "");
      role = String(body?.role ?? "");
      jobId = typeof body?.jobId === "string" ? body.jobId : null;
      applicationId = typeof body?.applicationId === "string" ? body.applicationId : null;
      saveCover = body?.saveCover === true;
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "Add a job description or upload a JD file." },
        { status: 400 },
      );
    }
    const resume = await getActiveResume(session.user.id);
    const scores = scoreResumeAgainstJd(resume?.textExcerpt ?? "", rawText);
    const draft = draftCoverFromJd({
      company: companyName,
      role,
      matched: scores.matched,
    });
    let coverLetterId: string | null = null;
    if (saveCover && (applicationId || jobId || (companyName.trim() && role.trim()))) {
      const cover = await createCoverLetter(session.user.id, {
        title: draft.title,
        body: draft.body,
        applicationId,
        companyName,
        role,
        jobId,
      });
      coverLetterId = cover.id;
    }
    const analysis = await createJobAnalysis(session.user.id, {
      rawText,
      summary: `ATS ${scores.atsScore} · resume match ${scores.resumeMatchScore}. Missing: ${scores.missing.slice(0, 8).join(", ") || "none"}.`,
      jobId,
      companyName,
      role,
      atsScore: scores.atsScore,
      resumeMatchScore: scores.resumeMatchScore,
      coverLetterId,
    });
    return NextResponse.json({
      analysisId: analysis.id,
      atsScore: scores.atsScore,
      resumeMatchScore: scores.resumeMatchScore,
      matched: scores.matched,
      missing: scores.missing,
      coverLetterId,
      draft,
      resumeFound: Boolean(resume?.textExcerpt),
    });
  } catch (err) {
    if (isDatabaseFailure(err)) {
      return NextResponse.json({ error: databaseErrorMessage(err) }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not score this JD.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
