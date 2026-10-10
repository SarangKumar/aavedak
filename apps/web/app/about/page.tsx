import type { Metadata } from "next";
import Link from "next/link";

import { CopyTextButton } from "@/components/copy-text-button";
import { ShellWidth } from "@/components/shell-width";
import { Card } from "@/components/ui/card";

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
    text: "Aavedak (आवेदक, “applicant”) is a job-search workspace for junior tech roles in India: it finds fresh openings, checks your resume with 10 ATS engines, tracks every application, and prepares referral emails you send from your own Gmail.",
  },
  {
    id: "short",
    title: "Short summary",
    text: "Aavedak (आवेदक, Hindi for “applicant”) is a job-search workspace for early-career tech candidates in India. Every day it reads the public job boards and career pages of more than 150 companies and recommends up to 50 junior roles (under 3 years of experience) in engineering, data, ML/AI, QA, IT, security and design, in India or remote and open to India. Each recommendation is ranked against your resume and links to the original posting. Before applying, you can check your resume with 10 ATS engines. Applications live in a tracker alongside your resumes, cover letters and email templates, and referral requests go out from your own Gmail only after you confirm. Aavedak recommends and prepares. You decide and send.",
  },
  {
    id: "long",
    title: "Detailed summary",
    text: "Aavedak (आवेदक, Hindi for “applicant”) is a calm, all-in-one job-search workspace built for early-career tech candidates in India.\n\nDiscover: every night Aavedak reads the official public job-board APIs (Greenhouse, Lever, Ashby, SmartRecruiters, Workable) and career pages of more than 150 companies. It keeps only junior roles that ask for under 3 years of experience, in engineering, data and analytics, ML/AI, QA, IT, security and design, located in India or remote and open to India. It then recommends up to 50 a day, ranked against your resume and career preferences. Every job links to its original posting, and nothing is invented or scraped from sites that don’t allow it.\n\nPrepare: the ATS page scores your resume with 10 engines: Aavedak’s own evidence-based scorer, five reference engines modelled on popular resume checkers, and four open-source analyzers. It works in resume-only, role or job-description mode and shows matched and missing skills with suggested fixes. Resumes, cover letters and email templates live in one Documents space.\n\nApply and follow up: applications move through a Kanban tracker with full status history. The Referrals page fills your email template for the people you choose at a company, attaches a resume if you want, and sends from your own Gmail after you confirm, with a 20-second undo window.\n\nAavedak recommends and prepares. You decide and send.",
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
  { href: "/ats", label: "ATS", body: "check resumes with 10 scoring engines." },
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
            See how it works →
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
    </ShellWidth>
  );
}
