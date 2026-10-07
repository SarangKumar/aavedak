import Image from "next/image";
import Link from "next/link";

const chips = [
  { label: "You send · Avsar prepares" },
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

      <div className="relative mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-20 lg:py-24">
        <section className="flex flex-col items-center px-1 text-center sm:px-0">
          <div className="relative mb-6 sm:mb-7">
            <div
              className="absolute inset-[-20%] rounded-[2rem] opacity-70 blur-3xl"
              style={{ background: "var(--glow)" }}
              aria-hidden
            />
            <Image
              src="/brand/icon.png"
              alt="Avsar"
              width={96}
              height={96}
              className="relative size-20 shadow-2xl shadow-black/40 sm:size-24"
              priority
            />
          </div>

          <p className="text-primary/90 mb-2 font-mono text-sm tracking-wide sm:mb-3" lang="sa">
            अवसर
          </p>

          <h1 className="avsar-display text-foreground text-4xl leading-none sm:text-5xl md:text-6xl">
            Avsar
          </h1>

          <p className="text-muted-foreground mt-2 text-xs font-medium uppercase tracking-wide sm:text-sm">
            Job-search OS
          </p>

          <p className="text-muted-foreground mt-4 max-w-lg text-pretty text-base leading-relaxed sm:mt-5 sm:text-lg">
            Avsar recommends and prepares. The user decides and sends.
          </p>

          <div className="mt-5 flex max-w-md flex-wrap items-center justify-center gap-2 sm:mt-6 sm:max-w-none">
            {chips.map((chip) => (
              <span key={chip.label} className="avsar-chip">
                <span className="avsar-chip-dot" aria-hidden />
                {chip.label}
              </span>
            ))}
          </div>

          <div className="mt-8 flex w-full max-w-sm flex-col items-stretch gap-3 sm:mt-9 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
            <Link
              href="/dashboard"
              className="bg-primary text-primary-foreground ring-primary/30 inline-flex min-h-11 items-center justify-center rounded-xl px-6 text-sm font-semibold shadow-lg shadow-black/20 ring-1 transition-opacity hover:opacity-90"
            >
              Open dashboard
            </Link>
            <Link
              href="/onboarding"
              className="border-border bg-card/80 text-foreground ring-ring/10 hover:bg-accent/80 inline-flex min-h-11 items-center justify-center rounded-xl border px-6 text-sm font-medium shadow-sm ring-1 backdrop-blur-sm transition-colors"
            >
              Start onboarding
            </Link>
          </div>
        </section>

        <section className="mt-14 sm:mt-20">
          <div className="mb-4 flex flex-col gap-1 sm:mb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <h2 className="text-foreground text-sm font-semibold tracking-tight">Workspace</h2>
            <p className="text-muted-foreground text-xs">
              Everything you need to find and ship applications
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="border-border/80 bg-card/70 ring-ring/5 hover:border-primary/25 hover:bg-accent/50 group flex min-h-[7.5rem] flex-col rounded-2xl border p-4 shadow-sm ring-1 backdrop-blur-sm transition-all hover:shadow-md hover:shadow-black/10 sm:p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-foreground text-sm font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <span className="text-primary/90 bg-primary/10 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {item.label}
                  </span>
                </div>
                <p className="text-muted-foreground mt-2.5 text-sm leading-relaxed">
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
