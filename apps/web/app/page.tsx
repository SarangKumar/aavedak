import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arambh · Discover · Apply · Grow",
  description:
    "Arambh (आरंभ) is your personal job-search OS — discover roles, prepare documents, track applications, and grow your career. Arambh recommends and prepares. You decide and send.",
};

const chips = [
  { label: "You send · Arambh prepares" },
  { label: "Recommend · Decide · Act" },
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
] as const;

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-90" aria-hidden />

      <div className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
        <section
          className="avsar-fade-up flex flex-col items-center px-1 text-center sm:px-0"
          aria-labelledby="hero-heading"
        >
          <div className="relative mb-5 sm:mb-6">
            <div
              className="absolute inset-[-20%] rounded-[2rem] opacity-70 blur-3xl"
              style={{ background: "var(--glow)" }}
              aria-hidden
            />
            <Image
              src="/brand/logo-icon.png"
              alt="Arambh — stylized golden A mark"
              width={96}
              height={96}
              className="avsar-logo relative h-[4.5rem] w-[4.5rem] sm:h-24 sm:w-24"
              priority
            />
          </div>

          <p
            className="text-primary/90 mb-1.5 font-mono text-[13px] tracking-wide sm:mb-2"
            lang="hi"
          >
            आरंभ
          </p>

          <h1
            id="hero-heading"
            className="avsar-display text-foreground text-3xl leading-none sm:text-5xl md:text-6xl"
          >
            Arambh
          </h1>

          <p className="text-muted-foreground mt-1.5 text-[11px] font-medium uppercase tracking-wide sm:text-xs">
            Discover · Apply · Grow
          </p>

          <p className="text-muted-foreground mt-3.5 max-w-lg text-pretty text-[15px] leading-relaxed sm:mt-4 sm:text-base">
            Arambh recommends and prepares. The user decides and sends.
          </p>

          <div className="avsar-fade-up avsar-fade-up-delay-1 mt-4 flex max-w-md flex-wrap items-center justify-center gap-1.5 sm:mt-5 sm:max-w-none">
            {chips.map((chip) => (
              <span key={chip.label} className="avsar-chip">
                <span className="avsar-chip-dot" aria-hidden />
                {chip.label}
              </span>
            ))}
          </div>

          <div className="avsar-fade-up avsar-fade-up-delay-2 mt-6 flex w-full max-w-sm flex-col items-stretch gap-2 sm:mt-7 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
            <Link
              href="/dashboard"
              className="avsar-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-9 items-center justify-center rounded-lg px-5 text-[13px] font-semibold shadow-md shadow-black/15 ring-1 hover:opacity-90"
            >
              Open dashboard
            </Link>
            <Link
              href="/onboarding"
              className="avsar-btn border-border bg-card/80 text-foreground ring-ring/10 hover:text-primary inline-flex h-9 items-center justify-center rounded-lg border px-5 text-[13px] font-medium shadow-sm ring-1 backdrop-blur-sm"
            >
              Start onboarding
            </Link>
          </div>
        </section>

        <section
          className="avsar-fade-up avsar-fade-up-delay-3 mt-12 sm:mt-16"
          aria-labelledby="workspace-heading"
        >
          <div className="mb-3.5 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <h2
              id="workspace-heading"
              className="text-foreground text-[13px] font-semibold tracking-tight"
            >
              Workspace
            </h2>
            <p className="text-muted-foreground text-[11px]">
              Everything you need to find and ship applications
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="avsar-card-lift avsar-fade-up avsar-fade-up-delay-3 border-border/80 bg-card/70 ring-ring/5 hover:border-primary/25 group flex min-h-[6.75rem] flex-col rounded-2xl border p-3.5 shadow-sm ring-1 backdrop-blur-sm sm:p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-foreground text-[13px] font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <span className="text-primary/90 bg-primary/10 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                    {item.label}
                  </span>
                </div>
                <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
