import { OutreachInbox } from "@/components/outreach-inbox";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications } from "@/lib/applications";
import { listFollowUps } from "@/lib/follow-ups";
import { getGmailAuthStatus } from "@/lib/gmail";
import { listRepliesForUser } from "@/lib/mail-replies";
import { listPeople } from "@/lib/people";

/** Shared loader for /outreach (page) and /outreach/board (full-screen inbox). */
export async function OutreachBoard({ variant }: { variant: "page" | "board" }) {
  const { user } = await requireOnboarded();
  const followUps = await listFollowUps(user.id, { includeClosed: true });
  const people = await listPeople({ includeArchived: true });
  const applications = await listApplications(user.id, "active");
  const [replies, gmail] = await Promise.all([
    listRepliesForUser(user.id),
    getGmailAuthStatus(user.id),
  ]);

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="relative">
        <OutreachInbox
          variant={variant}
          initialFollowUps={followUps.map((f) => ({
            id: f.id,
            title: f.title,
            dueDate: f.dueDate,
            sendAfter: f.sendAfter,
            status: f.status,
            personId: f.personId,
            applicationId: f.applicationId,
            notes: f.notes,
            mailKind: f.mailKind,
            mailTo: f.mailTo,
            mailSubject: f.mailSubject,
            mailBody: f.mailBody,
            sendError: f.sendError,
            gmailMessageId: f.gmailMessageId,
            gmailThreadId: f.gmailThreadId,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          }))}
          initialReplies={replies}
          replyDetectionReady={gmail.readReady}
          people={people.map((p) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            company: p.company,
            roleTitle: p.roleTitle,
          }))}
          applications={applications.map((a) => ({
            id: a.id,
            companyName: a.companyName,
            role: a.role,
          }))}
        />
      </div>
    </div>
  );
}
