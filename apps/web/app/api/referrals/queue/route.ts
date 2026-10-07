import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getApplication } from "@/lib/applications";
import { createFollowUp } from "@/lib/follow-ups";
import { getPerson } from "@/lib/people";
import { ensureProfile } from "@/lib/profile";
import { getResume } from "@/lib/resumes";

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * Queue outreach follow-ups for confirmed recipients.
 * Default delay is 20 seconds (sendAfterSeconds). Sending happens after the
 * on-screen countdown finishes (process-queue) or via cron.
 * Body: { applicationId, personIds, subject, body, dueDate?, sendAfterSeconds?,
 *         resumeId?, confirmed: true }
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
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
  const sendAfterSecondsRaw = body.sendAfterSeconds ?? body.sendAfterMinutes;
  let sendAfterSeconds = 20;
  if (typeof sendAfterSecondsRaw === "number" && Number.isFinite(sendAfterSecondsRaw)) {
    // Legacy clients may still send minutes; values ≤ 120 are treated as seconds.
    sendAfterSeconds =
      body.sendAfterSeconds !== undefined
        ? Math.min(3600, Math.max(0, Math.round(sendAfterSecondsRaw)))
        : Math.min(3600, Math.max(0, Math.round(sendAfterSecondsRaw * 60)));
  }
  const sendAfter = new Date(Date.now() + sendAfterSeconds * 1000).toISOString();
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
    const person = await getPerson(userId, personId);
    if (!person || person.status === "archived") {
      return NextResponse.json({ error: `Person not found: ${personId}` }, { status: 400 });
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
      `To: ${person.email ?? "(no email)"}`,
      `From: ${session.user.email}`,
      resumeId ? `Resume: ${resumeId}` : null,
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
      toEmail: person.email,
      subject,
      bodyText: renderedBody.trim() || null,
      resumeId,
    });
    created.push({
      id: followUp.id,
      title: followUp.title,
      dueDate: followUp.dueDate,
      sendAfter: followUp.sendAfter,
      status: followUp.status,
      personId: followUp.personId,
      applicationId: followUp.applicationId,
      resumeId: followUp.resumeId,
      notes: followUp.notes,
      createdAt: followUp.createdAt,
      updatedAt: followUp.updatedAt,
    });
  }

  return NextResponse.json(
    {
      followUps: created,
      count: created.length,
      sendAfterSeconds,
      gmail: "queued",
      note: "Queued with a 20s on-screen delay before Gmail send.",
    },
    { status: 201 },
  );
}
