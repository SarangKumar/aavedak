import type { Metadata } from "next";
import Link from "next/link";

import { ShellWidth } from "@/components/shell-width";

export const metadata: Metadata = {
  title: "About",
  description: "What Aavedak is — and what it is not.",
};

const principles = [
  {
    title: "Recommend and prepare",
    body: "Aavedak helps you organize applications, documents, people, and follow-ups so outreach is ready when you are.",
  },
  {
    title: "You decide and send",
    body: "Queued follow-ups never auto-send Gmail for you. Review, edit, and send on your terms.",
  },
  {
    title: "Local-first today",
    body: "Your workspace data lives in a local SQLite store while the product hardens. Production storage comes later.",
  },
] as const;

export default function AboutPage() {
  return (
    <ShellWidth className="aavedak-fade-up space-y-8 py-10 sm:py-14">
      <header className="max-w-2xl space-y-3">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
          आवेदक
        </p>
        <h1 className="aavedak-display text-foreground text-3xl sm:text-4xl">About Aavedak</h1>
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          Aavedak (आवेदक) means applicant. It is a calm job-search workspace for tracking roles,
          documents, referrals, and follow-ups — without taking the send button out of your hands.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {principles.map((item) => (
          <article
            key={item.title}
            className="border-border/80 bg-card rounded-lg border p-4 shadow-sm"
          >
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
              {item.title}
            </h2>
            <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="border-border/80 bg-card max-w-2xl space-y-3 rounded-lg border p-5 shadow-sm">
        <h2 className="text-foreground text-[13px] font-semibold tracking-tight">Workspace map</h2>
        <ul className="text-muted-foreground space-y-2 text-[13px] leading-relaxed">
          <li>
            <Link href="/jobs" className="text-primary hover:underline">
              Jobs
            </Link>{" "}
            — discover and shortlist roles.
          </li>
          <li>
            <Link href="/job-tracker" className="text-primary hover:underline">
              Tracker
            </Link>{" "}
            — pipeline by stage.
          </li>
          <li>
            <Link href="/documents" className="text-primary hover:underline">
              Documents
            </Link>{" "}
            — resumes, cover letters, templates.
          </li>
          <li>
            <Link href="/referrals" className="text-primary hover:underline">
              Referrals
            </Link>{" "}
            — compose cold outreach and queue asks.
          </li>
          <li>
            <Link href="/people" className="text-primary hover:underline">
              People
            </Link>{" "}
            — contacts CRM.
          </li>
          <li>
            <Link href="/follow-ups" className="text-primary hover:underline">
              Follow-ups
            </Link>{" "}
            — pending and queued tasks.
          </li>
        </ul>
        <p className="text-muted-foreground pt-1 text-[12px]">
          See the{" "}
          <Link href="/changelog" className="text-primary hover:underline">
            changelog
          </Link>{" "}
          for what shipped recently.
        </p>
      </section>
    </ShellWidth>
  );
}
