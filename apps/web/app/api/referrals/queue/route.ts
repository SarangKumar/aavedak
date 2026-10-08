import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { getApplication } from "@/lib/applications";
import {
  createFollowUp,
  listFollowUps,
  type FollowUpMailKind,
  type FollowUpRecord,
} from "@/lib/follow-ups";
import { getGmailAuthStatus, replySubject } from "@/lib/gmail";
import { getPerson } from "@/lib/people";
import { getResume } from "@/lib/resumes";

const FOLLOWUP_COOLDOWN_MS = 60 * 60 * 1000;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

function mailKindOf(row: FollowUpRecord): FollowUpMailKind {
  if (row.mailKind === "outreach" || row.mailKind === "followup") return row.mailKind;
  if (row.title.startsWith("Follow-up:")) return "followup";
  return "outreach";
}

function isBlockingSend(status: FollowUpRecord["status"]): boolean {
  return status === "sent" || status === "sent_stub" || status === "queued" || status === "pending";
}

/**
 * Queue outreach / follow-up mail for confirmed recipients.
 * Body: { applicationId, personIds, subject, body, dueDate?, sendAfterSeconds?,
 *         resumeId?, confirmed: true, mailKind?: "outreach" | "followup" }
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
  const mailKind: FollowUpMailKind = body.mailKind === "followup" ? "followup" : "outreach";

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

  const existing = await listFollowUps(userId, { includeClosed: true });
  const forApp = existing.filter((f) => f.applicationId === applicationId);

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

    const personRows = forApp.filter((f) => f.personId === personId);

    if (mailKind === "outreach") {
      const already = personRows.some(
        (f) => mailKindOf(f) === "outreach" && isBlockingSend(f.status),
      );
      if (already) {
        return NextResponse.json(
          {
            error: `A referral email was already sent or queued to ${person.name} for this job.`,
            code: "outreach_already_sent",
          },
          { status: 409 },
        );
      }
    } else {
      const hasOutreach = personRows.some(
        (f) => mailKindOf(f) === "outreach" && (f.status === "sent" || f.status === "sent_stub"),
      );
      if (!hasOutreach) {
        return NextResponse.json(
          {
            error: `Send a referral email to ${person.name} before a follow-up.`,
            code: "outreach_required",
          },
          { status: 400 },
        );
      }
      const lastSend = personRows
        .filter((f) => f.status === "sent" || f.status === "sent_stub")
        .map((f) => new Date(f.updatedAt || f.createdAt).getTime())
        .reduce((max, t) => Math.max(max, t), 0);
      if (lastSend && Date.now() - lastSend < FOLLOWUP_COOLDOWN_MS) {
        const waitMin = Math.ceil((FOLLOWUP_COOLDOWN_MS - (Date.now() - lastSend)) / 60_000);
        return NextResponse.json(
          {
            error: `Wait about ${waitMin} minute${waitMin === 1 ? "" : "s"} before another follow-up to ${person.name}.`,
            code: "followup_cooldown",
          },
          { status: 429 },
        );
      }
    }

    const vars = {
      ...baseVars,
      person_name: person.name,
      person_email: person.email ?? "",
    };
    let subject = fill(subjectTpl, vars);
    if (mailKind === "followup") {
      const parentOutreach = personRows
        .filter(
          (f) =>
            mailKindOf(f) === "outreach" &&
            (f.status === "sent" || f.status === "sent_stub") &&
            f.mailSubject?.trim(),
        )
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime(),
        )[0];
      if (parentOutreach?.mailSubject) {
        subject = replySubject(parentOutreach.mailSubject);
      } else if (!/^re:\s*/i.test(subject)) {
        subject = replySubject(subject);
      }
    }
    const renderedBody = fill(bodyTpl, vars);
    const title =
      mailKind === "followup"
        ? `Follow-up: ${person.name} · ${application.companyName}`
        : `Outreach: ${person.name} · ${application.companyName}`;
    const notes = [
      subject ? `Subject: ${subject}` : null,
      `To: ${person.email}`,
      `From: ${session.user.email}`,
      `Kind: ${mailKind}`,
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
      mailKind,
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
      mailKind: followUp.mailKind,
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
      mailKind,
      gmail: "queued",
      note:
        sendAfterMs === 0
          ? "Queued for immediate send after the on-screen countdown."
          : `Queued with ~${Math.round(sendAfterMs / 1000)}s delay before Gmail send.`,
    },
    { status: 201 },
  );
}
