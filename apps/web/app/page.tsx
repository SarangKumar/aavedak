import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

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

export default function HomePage() {
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
            <Image
              src="/brand/logo-icon.png"
              alt="Aavedak — stylized golden A mark"
              width={96}
              height={96}
              className="aavedak-logo relative h-[4.5rem] w-[4.5rem] sm:h-24 sm:w-24"
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

          <p className="text-muted-foreground mt-3.5 max-w-xl text-pretty text-[15px] leading-relaxed sm:mt-4 sm:text-base">
            Your personal job-search OS. Aavedak recommends and prepares — you decide and send.
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
              href="/sign-in"
              className="aavedak-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-10 cursor-pointer items-center justify-center rounded-lg px-6 text-[14px] font-semibold shadow-md shadow-black/15 ring-1 hover:opacity-90"
            >
              Get started
            </Link>
            <Link
              href="/dashboard"
              className="aavedak-btn border-border bg-card text-foreground ring-ring/10 hover:text-primary inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border px-6 text-[14px] font-medium shadow-sm ring-1 backdrop-blur-sm"
            >
              Open dashboard
            </Link>
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
      </div>
    </div>
  );
}
