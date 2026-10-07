import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { getApplication } from "@/lib/applications";
import { createFollowUp } from "@/lib/follow-ups";
import { getGmailAuthStatus } from "@/lib/gmail";
import { getPerson } from "@/lib/people";
import { getResume } from "@/lib/resumes";

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * Queue outreach follow-ups for confirmed recipients.
 * Prefer sendAfterSeconds (default 0 after on-screen 20s countdown).
 * Legacy sendAfterMinutes still accepted.
 * Body: { applicationId, personIds, subject, body, dueDate?, sendAfterSeconds?,
 *         sendAfterMinutes?, resumeId?, confirmed: true }
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
  const resumeId =
    typeof body.resumeId === "string" && body.resumeId.trim() ? body.resumeId.trim() : null;

  let sendAfterMs = 0;
  if (typeof body.sendAfterSeconds === "number" && Number.isFinite(body.sendAfterSeconds)) {
    sendAfterMs = Math.min(3600, Math.max(0, Math.round(body.sendAfterSeconds))) * 1000;
  } else if (typeof body.sendAfterMinutes === "number" && Number.isFinite(body.sendAfterMinutes)) {
    sendAfterMs = Math.min(24 * 60, Math.max(0, Math.round(body.sendAfterMinutes))) * 60_000;
  }
  const sendAfter = new Date(Date.now() + sendAfterMs).toISOString();
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
  if (resumeId) {
    const resume = await getResume(userId, resumeId);
    if (!resume || resume.status === "archived") {
      return NextResponse.json({ error: "Resume not found." }, { status: 400 });
    }
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
      resumeId ? `Resume-Id: ${resumeId}` : null,
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
      sendAfterMs,
      resumeId,
      gmail: "queued",
      note:
        sendAfterMs === 0
          ? "Queued for immediate send after the on-screen countdown."
          : `Queued with ~${Math.round(sendAfterMs / 1000)}s delay before Gmail send.`,
    },
    { status: 201 },
  );
}
