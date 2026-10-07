import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createApplication, findApplicationByCompanyRole } from "@/lib/applications";
import { databaseErrorMessage, isDatabaseFailure } from "@/lib/db-config";
import { setJobDecision } from "@/lib/jobs";
import { ensureProfile } from "@/lib/profile";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
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
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => null)) as { decision?: unknown } | null;
    const decision =
      body?.decision === "ignored" ? "ignored" : body?.decision === "applied" ? "applied" : null;
    if (!decision) {
      return NextResponse.json({ error: "decision must be applied or ignored." }, { status: 400 });
    }
    const job = await setJobDecision(session.user.id, id, decision);
    let applicationId: string | null = null;
    if (decision === "applied") {
      const existing = await findApplicationByCompanyRole(session.user.id, job.company, job.title);
      if (existing) {
        applicationId = existing.id;
      } else {
        const application = await createApplication(session.user.id, {
          companyName: job.company,
          role: job.title,
          location: job.location || "Remote",
          jobLink: job.url,
          jobId: job.id,
          status: "applied",
          notes: job.description ? job.description.slice(0, 2000) : null,
          appliedAt: new Date().toISOString(),
        });
        applicationId = application.id;
      }
    }
    return NextResponse.json({
      job: {
        id: job.id,
        decision: job.decision,
        atsScore: job.atsScore,
        resumeMatchScore: job.resumeMatchScore,
      },
      applicationId,
    });
  } catch (err) {
    if (isDatabaseFailure(err)) {
      return NextResponse.json({ error: databaseErrorMessage(err) }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not update job.";
    const status = message === "Job not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
