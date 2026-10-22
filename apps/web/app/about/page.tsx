import type { Metadata } from "next";
import Link from "next/link";

import { CopyTextButton } from "@/components/copy-text-button";
import { ShellWidth } from "@/components/shell-width";
import { Card } from "@/components/ui/card";
import { ATS_ENGINES } from "@/lib/ats-engines/registry";

const ENGINE_TOTAL = ATS_ENGINES.length;
const ENGINE_REFERENCE_COUNT = ATS_ENGINES.filter((e) => e.kind === "reference").length;
const ENGINE_OSS_COUNT = ATS_ENGINES.filter((e) => e.kind === "open_source").length;

export const metadata: Metadata = {
  robots: { index: true, follow: true },
  title: "About",
  description:
    "What Aavedak is: a job-search workspace for junior tech roles in India that recommends and prepares, while you decide and send.",
  alternates: { canonical: "/about" },
};

// Copy-ready descriptions of the product. Keep them in sync with what the app actually does.
const summaries = [
  {
    id: "one-line",
    title: "One line",
    text: `Aavedak (आवेदक, “applicant”) is a job-search workspace for junior tech roles in India: it finds fresh openings, checks your resume with ${ENGINE_TOTAL} ATS engines, tracks every application, and prepares referral emails you send from your own Gmail.`,
  },
  {
    id: "short",
    title: "Short summary",
    text: `Aavedak (आवेदक, Hindi for “applicant”) is a job-search workspace for early-career tech candidates in India. Every day it reads the careers pages of about 590 companies (job boards fill the gaps) and recommends up to 50 junior roles (under 3 years of experience) in engineering, data, ML/AI, QA, IT, security and design, in India or remote and open to India. Each recommendation is ranked against your resume and links to the original posting. Before applying, you can check your resume with ${ENGINE_TOTAL} ATS engines. Applications live in a tracker alongside your resumes, cover letters and email templates, and referral requests go out from your own Gmail only after you confirm. Aavedak recommends and prepares. You decide and send.`,
  },
  {
    id: "long",
    title: "Detailed summary",
    text: `Aavedak (आवेदक, Hindi for “applicant”) is a calm, all-in-one job-search workspace built for early-career tech candidates in India.\n\nDiscover: every day Aavedak reads the careers pages of about 590 companies, through the hiring platform a page runs on (Workday, Greenhouse, Lever, Ashby, SmartRecruiters, Workable) or the job data the page publishes, and checks public job boards only to fill gaps. It keeps only junior roles that ask for under 3 years of experience, in engineering, data and analytics, ML/AI, QA, IT, security and design, located in India or remote and open to India. It then recommends up to 50 a day, ranked against your resume and career preferences. Every job links to its original posting, and nothing is invented or scraped from sites that don’t allow it.\n\nPrepare: the ATS page scores your resume with ${ENGINE_TOTAL} engines: Aavedak’s own evidence-based scorer, ${ENGINE_REFERENCE_COUNT} reference engines modelled on popular resume checkers, and ${ENGINE_OSS_COUNT} open-source analyzers. It works in resume-only, role or job-description mode and shows matched and missing skills with suggested fixes. Resumes, cover letters and email templates live in one Documents space.\n\nApply and follow up: applications move through a Kanban tracker with full status history. The Referrals page fills your email template for the people you choose at a company, attaches a resume if you want, and sends from your own Gmail after you confirm, with a 20-second undo window.\n\nAavedak recommends and prepares. You decide and send.`,
  },
] as const;

const principles = [
  {
    title: "Recommend and prepare",
    body: "Aavedak finds roles, scores your resume and drafts outreach, so the work is ready when you are.",
  },
  {
    title: "You decide and send",
    body: "Nothing is sent without your confirmation. Mail leaves your own Gmail after a 20-second undo window, and you can revoke access anytime.",
  },
  {
    title: "Honest by default",
    body: "Jobs come only from permitted sources and always link to the original posting. Aavedak never invents jobs, skills or experience.",
  },
] as const;

const audience = [
  "Students and new graduates looking for their first tech job in India.",
  "Early-career engineers, analysts, testers and designers with under 3 years of experience.",
  "Anyone who wants applications, resumes and referral asks in one place instead of scattered across spreadsheets and inboxes.",
] as const;

const workspace = [
  {
    href: "/dashboard",
    label: "Dashboard",
    body: "headline numbers, funnel and what needs attention.",
  },
  { href: "/jobs", label: "Jobs", body: "daily recommendations and the jobs you've applied to." },
  { href: "/ats", label: "Resume · Score", body: "check resumes with 10 scoring engines." },
  {
    href: "/resume-improver",
    label: "Resume · Improve",
    body: "tighten wording and ordering for a role, without inventing anything.",
  },
  {
    href: "/job-tracker",
    label: "Tracker",
    body: "every application by status, as a board or list.",
  },
  { href: "/documents", label: "Documents", body: "resumes, cover letters and email templates." },
  {
    href: "/referrals",
    label: "Referrals",
    body: "ask for referrals and send follow-ups from Gmail.",
  },
] as const;

const areas = [
  {
    title: "Discover",
    body: `Every day Aavedak reads the careers pages of about 590 companies and recommends up to 50 junior roles that fit you, best match first, each linking to the original posting. It keeps only roles asking for under 3 years in engineering, data, ML/AI, QA, IT, security and design, in India or remote and open to India.`,
  },
  {
    title: "Prepare",
    body: `Score a resume with ${ENGINE_TOTAL} engines — Aavedak's own evidence-based scorer, ${ENGINE_REFERENCE_COUNT} modelled on popular resume checkers and ${ENGINE_OSS_COUNT} open-source analyzers — in resume-only, role or job-description mode. The Improve page tightens wording and ordering by rule, without adding a single claim you did not make.`,
  },
  {
    title: "Apply and track",
    body: "Applications move through a Kanban tracker with their full status history, the job they came from, the resume and cover letter you used, and a badge when a posting is pulled or expires. Resumes, cover letters and email templates live together in Documents.",
  },
  {
    title: "Reach out",
    body: "Pick the people at a company, fill one of your templates, attach a resume if you want, and the mail goes from your own Gmail after you confirm — with 20 seconds to undo. Follow-ups are yours to queue, and replies are synced back so you can see who answered.",
  },
] as const;

const limits = [
  "No invented jobs, skills, requirements or salaries. Pay is shown only where the company states it.",
  "No scraping of sites that do not allow it. LinkedIn, Indeed, Glassdoor, Naukri and similar are never read for listings; every job links to its original posting.",
  "No guessed email addresses in outreach. A person's address is used only where it is actually published; anything inferred is marked as such and never sent to.",
  "No mail without your confirmation, and no mail from Aavedak's own domain — it leaves your Gmail, which you can disconnect at any time.",
  "No LLM writing your resume or your emails. Scoring and rewriting are deterministic rules, so the same input always gives the same result, and nothing is quietly generated in your name.",
] as const;

const stack = [
  {
    title: "Web app",
    body: "Next.js App Router with React and Tailwind, deployed on Vercel. Sign-in is Google only, self-hosted, and new accounts wait for approval.",
  },
  {
    title: "Scoring and discovery service",
    body: "A Python (FastAPI) service holds the ATS engines and the whole job-discovery pipeline — scanning, filtering, de-duplication and the matching engine — so the heavy, repetitive work never runs in your browser.",
  },
  {
    title: "Storage",
    body: "A Postgres database for everything structured, Google Cloud Storage for resume PDFs. Each account can delete its own data, files included, from Profile settings.",
  },
  {
    title: "Cost",
    body: "Aavedak runs on free tiers on purpose: no paid AI calls, no paid data provider, no per-job cost. That is also why the job scan is spread across the day in small, resumable runs.",
  },
] as const;

export default function AboutPage() {
  return (
    <ShellWidth className="aavedak-fade-up space-y-10 py-10 sm:py-14">
      <header className="max-w-2xl space-y-3">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
          आवेदक
        </p>
        <h1 className="aavedak-display text-foreground text-3xl sm:text-4xl">About Aavedak</h1>
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          Aavedak (आवेदक) means applicant. It is a calm job-search workspace for junior tech roles
          in India: it finds openings, checks your resume, tracks applications and prepares referral
          emails, without taking the send button out of your hands.
        </p>
        <p className="text-[13px]">
          <Link href="/how-it-works" className="text-primary hover:underline">
            See how it works, flow by flow →
          </Link>
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="summary-heading">
        <div className="max-w-2xl space-y-1">
          <h2
            id="summary-heading"
            className="text-foreground text-[15px] font-semibold tracking-tight"
          >
            Describe Aavedak
          </h2>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            Ready-to-paste descriptions for a profile, portfolio, resume or post. Pick the length
            you need.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {summaries.map((summary) => (
            <Card
              key={summary.id}
              className="border-border/80 gap-2 rounded-lg p-4 shadow-sm"
              aria-labelledby={`summary-${summary.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  id={`summary-${summary.id}`}
                  className="text-foreground text-[13px] font-semibold tracking-tight"
                >
                  {summary.title}
                </h3>
                <CopyTextButton text={summary.text} />
              </div>
              <div className="text-muted-foreground max-w-3xl space-y-2 text-[13px] leading-relaxed">
                {summary.text.split("\n\n").map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="areas-heading">
        <div className="max-w-2xl space-y-1">
          <h2
            id="areas-heading"
            className="text-foreground text-[15px] font-semibold tracking-tight"
          >
            What Aavedak does
          </h2>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            Four parts of one job search, in the order you meet them. Every flow behind them is
            drawn step by step on{" "}
            <Link href="/how-it-works" className="text-primary hover:underline">
              how it works
            </Link>
            .
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {areas.map((area) => (
            <Card
              key={area.title}
              className="border-border/80 bg-card h-full gap-2 rounded-lg border p-4 shadow-sm"
            >
              <h3 className="text-foreground text-[13px] font-semibold tracking-tight">
                {area.title}
              </h3>
              <p className="text-muted-foreground text-[13px] leading-relaxed">{area.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Principles">
        {principles.map((item) => (
          <Card
            key={item.title}
            className="border-border/80 bg-card gap-0 rounded-lg border p-4 shadow-sm"
          >
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
              {item.title}
            </h2>
            <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed">{item.body}</p>
          </Card>
        ))}
      </section>

      <section className="space-y-3" aria-labelledby="limits-heading">
        <div className="max-w-2xl space-y-1">
          <h2
            id="limits-heading"
            className="text-foreground text-[15px] font-semibold tracking-tight"
          >
            What Aavedak will not do
          </h2>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            The limits are part of the product, not gaps waiting to be filled.
          </p>
        </div>
        <Card className="border-border/80 bg-card gap-0 rounded-lg border p-5 shadow-sm">
          <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-[13px] leading-relaxed">
            {limits.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="border-border/80 bg-card gap-0 space-y-3 rounded-lg border p-5 shadow-sm">
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
            Who it&apos;s for
          </h2>
          <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-[13px] leading-relaxed">
            {audience.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-muted-foreground text-[12px] leading-relaxed">
            Sign in with Google. New accounts are approved before the workspace opens.
          </p>
        </Card>

        <Card className="border-border/80 bg-card gap-0 space-y-3 rounded-lg border p-5 shadow-sm">
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
            Workspace map
          </h2>
          <ul className="text-muted-foreground space-y-2 text-[13px] leading-relaxed">
            {workspace.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-primary hover:underline">
                  {item.label}
                </Link>{" "}
                — {item.body}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground pt-1 text-[12px]">
            Read{" "}
            <Link href="/how-it-works" className="text-primary hover:underline">
              how it works
            </Link>{" "}
            or see the{" "}
            <Link href="/changelog" className="text-primary hover:underline">
              changelog
            </Link>{" "}
            for what shipped recently.
          </p>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="border-border/80 bg-card gap-0 space-y-3 rounded-lg border p-5 shadow-sm">
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">Your data</h2>
          <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-[13px] leading-relaxed">
            <li>
              You sign in with Google. Aavedak stores your name, email and the career profile you
              fill in; it never asks for a password.
            </li>
            <li>
              Gmail access is optional and only requested when you want to send outreach. It is used
              to send mail you confirmed and to read replies to it. You can disconnect it whenever
              you like.
            </li>
            <li>
              Resume PDFs live in private cloud storage; only you and the scoring service read them.
              Nothing you upload is shared with another user or used to train anything.
            </li>
            <li>
              Profile settings → Danger Zone wipes your data or deletes the account outright, files
              included.
            </li>
          </ul>
          <p className="text-muted-foreground pt-1 text-[12px]">
            The full detail is in the{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              privacy policy
            </Link>{" "}
            and the{" "}
            <Link href="/terms" className="text-primary hover:underline">
              terms
            </Link>
            .
          </p>
        </Card>

        <Card className="border-border/80 bg-card gap-0 space-y-3 rounded-lg border p-5 shadow-sm">
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
            Under the hood
          </h2>
          <dl className="space-y-2.5">
            {stack.map((item) => (
              <div key={item.title} className="space-y-0.5">
                <dt className="text-foreground text-[13px] font-medium">{item.title}</dt>
                <dd className="text-muted-foreground text-[13px] leading-relaxed">{item.body}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <section className="space-y-3" aria-labelledby="status-heading">
        <div className="max-w-2xl space-y-1">
          <h2
            id="status-heading"
            className="text-foreground text-[15px] font-semibold tracking-tight"
          >
            Where it stands
          </h2>
        </div>
        <Card className="border-border/80 bg-card gap-2 rounded-lg border p-5 shadow-sm">
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            Aavedak is built and run by one person, Sarang Kumar, for a small group of job seekers
            rather than the open internet: accounts are approved by hand and the number of seats is
            capped, which keeps the free tiers it runs on honest. It is in active development — the
            matching engine, the ATS engines and the company list all change, and every change that
            is visible to you is written down.
          </p>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            Read{" "}
            <Link href="/how-it-works" className="text-primary hover:underline">
              how it works
            </Link>{" "}
            for the flows behind each page, or the{" "}
            <Link href="/changelog" className="text-primary hover:underline">
              changelog
            </Link>{" "}
            for what shipped recently.
          </p>
        </Card>
      </section>
    </ShellWidth>
  );
}
