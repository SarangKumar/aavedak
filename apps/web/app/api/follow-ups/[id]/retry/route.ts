import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { processDueQueuedFollowUps, retryFailedFollowUp } from "@/lib/follow-ups";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const { id } = await ctx.params;

  try {
    const followUp = await retryFailedFollowUp(authResult.user.id, id);
    const result = await processDueQueuedFollowUps(authResult.user.id);
    const processed = result.processed.find((p) => p.id === id) ?? followUp;
    return NextResponse.json({
      followUp: {
        id: processed.id,
        title: processed.title,
        dueDate: processed.dueDate,
        sendAfter: processed.sendAfter,
        status: processed.status,
        personId: processed.personId,
        applicationId: processed.applicationId,
        notes: processed.notes,
        mailKind: processed.mailKind,
        mailTo: processed.mailTo,
        mailSubject: processed.mailSubject,
        mailBody: processed.mailBody,
        sendError: processed.sendError,
        gmailMessageId: processed.gmailMessageId,
        gmailThreadId: processed.gmailThreadId,
        createdAt: processed.createdAt,
        updatedAt: processed.updatedAt,
      },
      sent: result.sent,
      failed: result.failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retry failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Follow-up not found." ? 404 : 400 },
    );
  }
}
