import Link from "next/link";

import { AboutFlowDiagram } from "@/components/about-flow-diagram";
import { Card } from "@/components/ui/card";
import { ATS_ENGINES } from "@/lib/ats-engines/registry";
import { FEATURES, type FeatureKey } from "@/lib/features";

const ENGINE_TOTAL = ATS_ENGINES.length;

// Keep in sync with what the app does (discovery: apps/api/app/discovery/DISCOVERY.md).
const STEPS: Array<{ feature: FeatureKey; title: string; body: string }> = [
  {
    feature: "onboarding",
    title: "Sign in and set up",
    body: "Sign in with Google. Onboarding asks for your years of experience, preferred roles and locations, and your resume.",
  },
  {
    feature: "jobs",
    title: "Fresh jobs every day",
    body: "Every day Aavedak reads about 590 company careers pages first, most of them Indian companies or companies with Indian offices. It reads the hiring platform behind each page (Workday, Greenhouse, Lever, Ashby, SmartRecruiters, Workable), structured job data on the page, linked job pages or the sitemap. Job boards are checked only when a page can't be read in full. It follows each site's robots.txt.",
  },
  {
    feature: "resumeScore",
    title: "Matched to you",
    body: `Tech roles only, India first. You see roles that ask for up to your years of experience plus 2, ranked against your resume. Each job links to the original posting and shows its ATS match across ${ENGINE_TOTAL} engines.`,
  },
  {
    feature: "improveResume",
    title: "Improve your resume",
    body: "Rule-based rewording and reordering for a role or a job. It never adds a number, skill or fact you didn't write, and shows the scores before and after.",
  },
  {
    feature: "people",
    title: "People at the company",
    body: "Contacts come from company websites, GitHub and other public sources, nearest to the job's city first. Outreach goes only to published email addresses, never to guesses.",
  },
  {
    feature: "referrals",
    title: "Ask for referrals",
    body: "Pick a job and the people to ask. Aavedak fills in your referral template and sends it from your own Gmail after you confirm, with a 20-second undo.",
  },
  {
    feature: "coverLetters",
    title: "Cover letters",
    body: "Write and keep a cover letter for each job, next to your resumes and email templates.",
  },
  {
    feature: "followUps",
    title: "Track and follow up",
    body: "Every application moves through the tracker. Follow-ups you queue are sent from your Gmail on their due date, and replies show up in your Inbox.",
  },
  {
    feature: "dashboard",
    title: "Dashboard",
    body: "Today's priorities, your application pulse and what to do next.",
  },
];

/** About page: how Aavedak works end to end, as a beam diagram plus short steps. */
export function AboutHowItWorks() {
  return (
    <section className="space-y-4" aria-labelledby="how-heading">
      <div className="max-w-2xl space-y-1">
        <h2 id="how-heading" className="text-foreground text-[15px] font-semibold tracking-tight">
          How Aavedak works
        </h2>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          What it reads, what you get, and the steps in between.
        </p>
      </div>

      <Card className="border-border/80 overflow-hidden rounded-lg px-3 py-8 shadow-sm sm:px-6 lg:py-10">
        <AboutFlowDiagram />
      </Card>

      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, i) => {
          const feature = FEATURES[step.feature];
          const Icon = feature.icon;
          return (
            <li key={step.feature}>
              <Card className="border-border/80 h-full gap-2 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-primary font-mono text-[11px] font-semibold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Icon aria-hidden strokeWidth={1.75} className="text-muted-foreground size-4" />
                  <h3 className="text-foreground text-[13px] font-semibold tracking-tight">
                    <Link href={feature.href} className="hover:text-primary hover:underline">
                      {step.title}
                    </Link>
                  </h3>
                </div>
                <p className="text-muted-foreground text-[13px] leading-relaxed">{step.body}</p>
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
