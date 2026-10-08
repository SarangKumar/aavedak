import Link from "next/link";
import type { Metadata } from "next";

import { BrandMark } from "@/components/brand-mark";
import { getOptionalAccess } from "@/lib/app-access";
import { hasFullyOnboarded } from "@/lib/onboarding";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
  title: "Aavedak · Discover · Apply · Grow",
  description:
    "Aavedak (आवेदक) is your personal job-search OS — discover roles, prepare documents, track applications, and grow your career. Aavedak recommends and prepares. You decide and send.",
};

const chips = [
  { label: "You send · Aavedak prepares" },
  { label: "Recommend · Decide · Act" },
  { label: "Local-first · Privacy-minded" },
] as const;

const features = [
  {
    href: "/dashboard",
    title: "Dashboard",
    label: "Focus",
    description: "Today's priorities, application pulse, and what to do next.",
  },
  {
    href: "/jobs",
    title: "Jobs",
    label: "Discover",
    description: "Multi-source roles as cards — scan, shortlist, open detail.",
  },
  {
    href: "/job-tracker",
    title: "Job tracker",
    label: "Pipeline",
    description: "Kanban and list views for every application stage.",
  },
  {
    href: "/documents",
    title: "Documents",
    label: "Prepare",
    description: "Resumes, cover letters, and reusable templates ready to send.",
  },
  {
    href: "/referrals",
    title: "Referrals",
    label: "Warm paths",
    description: "Track asks, follow-ups, and introductions that move the needle.",
  },
  {
    href: "/ats",
    title: "ATS",
    label: "Score",
    description: "Check resume ATS readiness and match against a job description.",
  },
] as const;

const steps = [
  {
    n: "01",
    title: "Discover",
    body: "Browse roles, bookmark what fits, and keep signals in one place.",
  },
  {
    n: "02",
    title: "Prepare",
    body: "Resumes, company-specific cover letters, and cold templates — ready when you are.",
  },
  {
    n: "03",
    title: "Act",
    body: "Track the pipeline, queue outreach, and follow up without losing context.",
  },
] as const;

export default async function HomePage() {
  const access = await getOptionalAccess();
  let primaryHref = "/sign-in";
  let primaryLabel = "Get started";
  if (access) {
    if (
      access.profile.approvalStatus === "pending" ||
      access.profile.approvalStatus === "rejected"
    ) {
      primaryHref = "/pending-approval";
      primaryLabel = "Check approval status";
    } else if (await hasFullyOnboarded(access.user.id)) {
      primaryHref = "/dashboard";
      primaryLabel = "Open dashboard";
    } else {
      primaryHref = "/onboarding";
      primaryLabel = "Continue onboarding";
    }
  }

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,var(--mesh-a),transparent_60%)] opacity-80"
      />
      <div className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
        <section
          className="aavedak-fade-up flex flex-col items-center px-1 text-center sm:px-0"
          aria-labelledby="hero-heading"
        >
          <div className="relative mb-5 sm:mb-6">
            <span className="aavedak-logo-glow" aria-hidden />
            <BrandMark
              width={96}
              height={96}
              className="relative h-[4.5rem] w-[4.5rem] sm:h-24 sm:w-24"
              priority
            />
          </div>

          <p
            className="text-primary/90 mb-1.5 font-mono text-[13px] tracking-wide sm:mb-2"
            lang="hi"
          >
            आवेदक
          </p>

          <h1
            id="hero-heading"
            className="aavedak-display text-foreground text-3xl leading-none sm:text-5xl md:text-6xl"
          >
            Aavedak
          </h1>

          <p className="text-muted-foreground mt-1.5 text-[11px] font-medium uppercase tracking-wide sm:text-xs">
            Discover · Apply · Grow
          </p>

          <p className="text-muted-foreground max-w-88 mt-3.5 text-balance text-[15px] leading-relaxed sm:mt-4 sm:max-w-md sm:text-base">
            Your personal job-search OS.
            <br className="hidden sm:block" /> Aavedak recommends and prepares — you decide and
            send.
          </p>

          <div className="aavedak-fade-up aavedak-fade-up-delay-1 mt-4 flex max-w-md flex-wrap items-center justify-center gap-1.5 sm:mt-5 sm:max-w-none">
            {chips.map((chip) => (
              <span key={chip.label} className="aavedak-chip">
                <span className="aavedak-chip-dot" aria-hidden />
                {chip.label}
              </span>
            ))}
          </div>

          <div className="aavedak-fade-up aavedak-fade-up-delay-2 mt-6 flex w-full max-w-sm flex-col items-stretch gap-2 sm:mt-8 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
            <Link
              href={primaryHref}
              className="aavedak-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-10 cursor-pointer items-center justify-center rounded-lg px-6 text-[14px] font-semibold shadow-md shadow-black/15 ring-1 hover:opacity-90"
            >
              {primaryLabel}
            </Link>
            {primaryHref === "/dashboard" ? (
              <Link
                href="/ats"
                className="aavedak-btn border-border bg-card text-foreground ring-ring/10 hover:text-primary inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border px-6 text-[14px] font-medium shadow-sm ring-1 backdrop-blur-sm"
              >
                Check ATS Score
              </Link>
            ) : null}
          </div>
        </section>

        <section
          className="aavedak-fade-up aavedak-fade-up-delay-2 mt-12 grid gap-2.5 sm:mt-16 sm:grid-cols-3"
          aria-label="How Aavedak works"
        >
          {steps.map((step) => (
            <div
              key={step.n}
              className="border-border/80 bg-card/80 rounded-xl border p-4 shadow-sm backdrop-blur-sm"
            >
              <p className="text-primary font-mono text-[11px] font-semibold tracking-wide">
                {step.n}
              </p>
              <h2 className="aavedak-section-title text-foreground mt-1">{step.title}</h2>
              <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </section>

        <section
          className="aavedak-fade-up aavedak-fade-up-delay-3 mt-12 sm:mt-16"
          aria-labelledby="workspace-heading"
        >
          <div className="mb-3.5 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <h2
              id="workspace-heading"
              className="text-foreground text-[14px] font-semibold tracking-tight"
            >
              Workspace
            </h2>
            <p className="aavedak-meta text-muted-foreground">
              Everything you need to find and ship applications
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="aavedak-card-lift aavedak-fade-up aavedak-fade-up-delay-3 border-border/80 bg-card ring-ring/5 hover:border-primary/25 group flex min-h-[6.75rem] cursor-pointer flex-col rounded-xl border p-3.5 shadow-sm ring-1 backdrop-blur-sm sm:p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="aavedak-section-title text-foreground text-[13px]">
                    {item.title}
                  </h3>
                  <span className="text-primary/90 bg-primary/10 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                    {item.label}
                  </span>
                </div>
                <p className="aavedak-body text-muted-foreground mt-2">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <footer className="aavedak-fade-up text-muted-foreground border-border/60 mt-14 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-6 text-[12px] sm:mt-16">
          <span>Aavedak · Discover · Apply · Grow</span>
          <Link href="/privacy" className="text-primary underline-offset-2 hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="text-primary underline-offset-2 hover:underline">
            Terms
          </Link>
        </footer>
      </div>
    </div>
  );
}
