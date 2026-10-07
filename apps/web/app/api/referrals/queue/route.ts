import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { getApplication } from "@/lib/applications";
import { createFollowUp } from "@/lib/follow-ups";
import { getGmailAuthStatus } from "@/lib/gmail";
import { getPerson } from "@/lib/people";

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * Queue outreach follow-ups for confirmed recipients.
 * Schedules send_after ≈ now + sendAfterMinutes (default 10). Cron sends via Gmail.
 * Body: { applicationId, personIds, subject, body, dueDate?, sendAfterMinutes?, confirmed: true }
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const session = { user: authResult.user };
  const userId = session.user.id;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
  const personIds = Array.isArray(body.personIds)
    ? body.personIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    : [];
  const subjectTpl = typeof body.subject === "string" ? body.subject : "";
  const bodyTpl = typeof body.body === "string" ? body.body : "";
  const dueDate =
    typeof body.dueDate === "string" && body.dueDate.trim() ? body.dueDate.trim() : null;
  const sendAfterMinutesRaw = body.sendAfterMinutes;
  const sendAfterMinutes =
    typeof sendAfterMinutesRaw === "number" && Number.isFinite(sendAfterMinutesRaw)
      ? Math.min(24 * 60, Math.max(1, Math.round(sendAfterMinutesRaw)))
      : 10;
  const sendAfter = new Date(Date.now() + sendAfterMinutes * 60_000).toISOString();
  const confirmed = body.confirmed === true;

  if (!confirmed) {
    return NextResponse.json(
      { error: "Confirm recipients before queueing follow-ups." },
      { status: 400 },
    );
  }
  if (!applicationId) {
    return NextResponse.json({ error: "Select an application first." }, { status: 400 });
  }
  if (personIds.length === 0) {
    return NextResponse.json({ error: "Select at least one recipient." }, { status: 400 });
  }

  const gmail = await getGmailAuthStatus(userId);
  if (!gmail.ready) {
    return NextResponse.json(
      {
        error: gmail.reason || "Authorize Gmail send before queueing outreach.",
        gmail,
        code: "gmail_not_authorized",
      },
      { status: 403 },
    );
  }

  const application = await getApplication(userId, applicationId);
  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const baseVars = {
    company: application.companyName,
    role: application.role,
    location: application.location,
    user_name: session.user.name?.split(" ")[0] || session.user.email.split("@")[0] || "",
  };

  const created = [];
  for (const personId of personIds) {
    const person = await getPerson(personId);
    if (!person || person.status === "archived") {
      return NextResponse.json({ error: `Person not found: ${personId}` }, { status: 400 });
    }
    if (!person.email?.trim()) {
      return NextResponse.json(
        { error: `${person.name} has no email — add one before queueing.` },
        { status: 400 },
      );
    }
    const vars = {
      ...baseVars,
      person_name: person.name,
      person_email: person.email ?? "",
    };
    const subject = fill(subjectTpl, vars);
    const renderedBody = fill(bodyTpl, vars);
    const title = `Outreach: ${person.name} · ${application.companyName}`;
    const notes = [
      subject ? `Subject: ${subject}` : null,
      `To: ${person.email}`,
      `From: ${session.user.email}`,
      "",
      renderedBody.trim() || "(empty body)",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const followUp = await createFollowUp(userId, {
      title,
      dueDate,
      sendAfter,
      personId: person.id,
      applicationId: application.id,
      notes,
      status: "queued",
      mailTo: person.email,
      mailSubject: subject,
      mailBody: renderedBody.trim(),
    });
    created.push({
      id: followUp.id,
      title: followUp.title,
      dueDate: followUp.dueDate,
      sendAfter: followUp.sendAfter,
      status: followUp.status,
      personId: followUp.personId,
      applicationId: followUp.applicationId,
      notes: followUp.notes,
      mailTo: followUp.mailTo,
      mailSubject: followUp.mailSubject,
      createdAt: followUp.createdAt,
      updatedAt: followUp.updatedAt,
    });
  }

  return NextResponse.json(
    {
      followUps: created,
      count: created.length,
      sendAfterMinutes,
      gmail: "queued",
      note: `Queued with ~${sendAfterMinutes} min delay. Cron / process-queue will send via your Gmail.`,
    },
    { status: 201 },
  );
}
