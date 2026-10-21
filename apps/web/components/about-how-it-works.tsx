import { AboutFlowDiagram } from "@/components/about-flow-diagram";
import { FLOW_STAGES, type FlowStageId } from "@/lib/about-flow";
import { ATS_ENGINES } from "@/lib/ats-engines/registry";

const ENGINE_TOTAL = ATS_ENGINES.length;

type FlowStep = { in: string; happens: string; out: string };

// The real data path, stage by stage. Keep in sync with the code (discovery:
// apps/api/app/discovery/DISCOVERY.md; web data layer: apps/web/lib/*).
const DETAILS: Record<FlowStageId, FlowStep> = {
  signin: {
    in: "Your Google account.",
    happens:
      "Better Auth signs you in with Google. A new account waits for approval before the workspace opens. Onboarding asks for your years of experience, preferred roles, skills and locations.",
    out: "Your user and session, your profile (with years of experience) and career preferences, saved in Postgres on Neon (profiles, user_preferences).",
  },
  resume: {
    in: "A PDF resume.",
    happens: "The file goes to Google Cloud Storage and its text is extracted on the server.",
    out: "The file in Cloud Storage and a resumes row with its text, which scoring and matching read.",
  },
  scan: {
    in: "A list of about 590 company careers pages (career_pages) and the job-board list (company_sources).",
    happens:
      "Vercel crons call the FastAPI discovery service six times a day, one slice of the list each, in time-boxed batches. For each careers page the crawler checks robots.txt, waits between requests, and reads the hiring platform the page runs on (Workday, Greenhouse, Lever, Ashby, SmartRecruiters, Workable), job data published on the page, linked job pages or the sitemap. A company's job board is scanned only when its careers page could not be read in full in the last 3 days.",
    out: "Raw postings, plus each page's reading method, status and job counts on career_pages.",
  },
  clean: {
    in: "Raw postings.",
    happens:
      "Only tech roles with a real link are kept: no executive titles, no roles asking more than 10 years, nothing past the expiry window. Each job gets a region (India, remote open to India, remote, global) and a salary only when the company states one. Privacy, cookie, equal-opportunity and legal footer text is stripped from the description. The same role from two sources is merged by company, title and city, and the careers-page link wins over a board link. A complete read closes jobs that are gone.",
    out: "jobs, plus job_sources (one row for each source that lists the job).",
  },
  match: {
    in: "New jobs, your profile and your resume text.",
    happens:
      "You are offered only roles that ask for at most your years of experience plus 2. India comes first, then remote open to India, remote and global. Jobs are scored against your skills and resume, and up to 50 new ones a day are recommended.",
    out: "Your recommendations and scores (user_job_state, job_scores), shown on the Jobs page.",
  },
  score: {
    in: "Your resume text and the job description.",
    happens: `${ENGINE_TOTAL} ATS engines score the resume and combine into a weighted final score (Native 50%, Reference 35%, Open Source 15%). Improve resume applies fixed rewording and reordering rules. A fact guard drops any change that would add or alter a number, date, skill or name, and both versions are scored with the same request.`,
    out: "Job checks saved in job_analyses. A saved improvement is a new inactive resume linked to the original, plus a resume_improvements record.",
  },
  people: {
    in: "Companies you applied to or that have live jobs.",
    happens:
      "People discovery reads company team pages, GitHub org members (including public commit emails) and search-API results; LinkedIn is never fetched. Anyone without an email is skipped and duplicates merge by email. Locations are normalised, so people in the job's city come first, then the same country.",
    out: "people, person_contacts and job_person_relevance. A guessed address is kept only as an 'inferred' contact and is never sent to.",
  },
  send: {
    in: "A job, the people you pick, your templates, an optional resume.",
    happens:
      "Your referral template is filled in, and a cover letter can be written and kept for the job. When you press send, a 20-second countdown lets you undo, then the mail leaves your own Gmail. Aavedak holds only the send-only Gmail permission for this.",
    out: "A follow_up_tasks row (queued, then sent) with the Gmail thread, and the application's status.",
  },
  replies: {
    in: "The Gmail threads of mail Aavedak sent, and the follow-ups you queued.",
    happens:
      "With the optional read-only Gmail permission, a daily cron checks those threads for replies; auto-replies, out-of-office notices and bounces don't count. A second daily cron sends queued follow-ups on their due date.",
    out: "mail_replies, and follow_up_tasks moved to sent or failed.",
  },
  workspace: {
    in: "Everything above.",
    happens:
      "Inbox groups mail into one thread for each person and application. The tracker moves each application through its statuses and keeps the history. The dashboard reads the same tables for today's priorities and your pulse.",
    out: "applications and application_events, shown in the Inbox, Job tracker and Dashboard.",
  },
};

/** About page: how data moves through Aavedak, as a beam diagram plus a step-by-step trace. */
export function AboutHowItWorks() {
  return (
    <section className="space-y-6" aria-labelledby="how-heading">
      <div className="max-w-2xl space-y-1">
        <h2 id="how-heading" className="text-foreground text-[15px] font-semibold tracking-tight">
          How Aavedak works
        </h2>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          The path your data takes, from sign-in to a reply in your Inbox: what goes in at each
          stage, what happens, and what is stored.
        </p>
      </div>

      <div className="py-2 lg:py-4">
        <AboutFlowDiagram />
      </div>

      <ol className="grid grid-cols-1 gap-x-10 gap-y-7 md:grid-cols-2">
        {FLOW_STAGES.map((stage, i) => {
          const step = DETAILS[stage.id];
          return (
            <li key={stage.id} className="space-y-2">
              <h3 className="text-foreground text-[13px] font-semibold tracking-tight">
                <span className="text-primary mr-2 font-mono text-[11px]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {stage.label}
              </h3>
              <dl className="text-[13px] leading-relaxed">
                {(
                  [
                    ["In", step.in],
                    ["What happens", step.happens],
                    ["Stored / out", step.out],
                  ] as const
                ).map(([term, text]) => (
                  <div
                    key={term}
                    className="grid grid-cols-1 gap-x-3 py-0.5 sm:grid-cols-[6.5rem_1fr]"
                  >
                    <dt className="text-muted-foreground text-[11px] uppercase tracking-wide sm:text-[12px] sm:normal-case sm:tracking-normal">
                      {term}
                    </dt>
                    <dd className="text-foreground/90">{text}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
