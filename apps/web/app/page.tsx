import Link from "next/link";
import type { Metadata } from "next";

import { FEATURES } from "@/lib/features";
import { BrandMark } from "@/components/brand-mark";
import { HomeCareerSources } from "@/components/home-career-sources";
import { HomeFaq } from "@/components/home-faq";
import { HomeFlow } from "@/components/home-flow";
import { HomeOpeningsSection } from "@/components/home-openings-section";
import { HomePromises } from "@/components/home-promises";
import { getOptionalAccess } from "@/lib/app-access";
import { getCareersShowcase } from "@/lib/careers-showcase";
import { getJobMapSummary } from "@/lib/job-map/query";
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

// Labels, icons and descriptions come from lib/features (shared with the nav and Cmd+K).
const features = (
  [
    ["dashboard", "Focus"],
    ["jobs", "Discover"],
    ["tracker", "Pipeline"],
    ["documents", "Prepare"],
    ["referrals", "Warm paths"],
    ["resumeScore", "Score"],
    ["improveResume", "Refine"],
  ] as const
).map(([key, tag]) => ({ ...FEATURES[key], tag }));

export default async function HomePage() {
  const [access, jobMap, careers] = await Promise.all([
    getOptionalAccess(),
    getJobMapSummary(),
    getCareersShowcase(),
  ]);
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
          className="aavedak-home-section aavedak-fade-up aavedak-fade-up-delay-2"
          aria-labelledby="flow-heading"
        >
          <div className="mb-3.5 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <h2
              id="flow-heading"
              className="text-foreground text-[14px] font-semibold tracking-tight"
            >
              How it works
            </h2>
            <p className="aavedak-meta text-muted-foreground">
              Not a straight line — loop back to any step as often as you need
            </p>
          </div>
          <HomeFlow />
        </section>

        <section
          className="aavedak-home-section aavedak-fade-up aavedak-fade-up-delay-3"
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
                  <h3 className="aavedak-section-title text-foreground flex items-center gap-1.5 text-[13px]">
                    <item.icon className="text-primary size-4" aria-hidden />
                    {item.label}
                  </h3>
                  <span className="text-primary/90 bg-primary/10 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                    {item.tag}
                  </span>
                </div>
                <p className="aavedak-body text-muted-foreground mt-2">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>

        {jobMap && jobMap.cities.length > 0 ? <HomeOpeningsSection summary={jobMap} /> : null}

        {careers && careers.companies.length > 0 ? <HomeCareerSources showcase={careers} /> : null}

        <HomePromises />

        <HomeFaq />
      </div>
    </div>
  );
}
