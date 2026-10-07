import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { scoreResumeAts } from "@/lib/resumes";

type Ctx = { params: Promise<{ id: string }> };

/** Compute / refresh ATS readiness for one resume (shows spinner on the card until done). */
export async function POST(_request: Request, ctx: Ctx) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const { id } = await ctx.params;
  try {
    const resume = await scoreResumeAts(authResult.user.id, id);
    return NextResponse.json({
      resume: {
        id: resume.id,
        displayName: resume.displayName,
        status: resume.status,
        originalFilename: resume.originalFilename,
        byteSize: resume.byteSize,
        atsScore: resume.atsScore,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ATS scoring failed.";
    const status = message === "Resume not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
