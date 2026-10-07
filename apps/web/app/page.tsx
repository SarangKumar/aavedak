import Image from "next/image";
import Link from "next/link";

const features = [
  {
    href: "/dashboard",
    title: "Dashboard",
    description: "Today's focus, application summary, and next actions.",
  },
  {
    href: "/jobs",
    title: "Jobs",
    description: "Multi-source roles as cards with list and detail panes.",
  },
  {
    href: "/job-tracker",
    title: "Job tracker",
    description: "Kanban and list views for every application stage.",
  },
  {
    href: "/documents",
    title: "Documents",
    description: "Resumes, cover letters, and reusable templates.",
  },
  {
    href: "/referrals",
    title: "Referrals",
    description: "Track asks, follow-ups, and warm introductions.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <section className="flex flex-col items-center text-center">
        <div className="relative mb-6">
          <div className="bg-primary/10 absolute inset-0 rounded-2xl blur-2xl" aria-hidden />
          <Image
            src="/brand/icon.png"
            alt="Avsar"
            width={88}
            height={88}
            className="ring-border relative rounded-2xl shadow-lg ring-1"
            priority
          />
        </div>
        <p className="text-muted-foreground mb-2 font-mono text-sm" lang="sa">
          अवसर
        </p>
        <h1 className="text-foreground text-4xl font-semibold tracking-tight sm:text-5xl">Avsar</h1>
        <p className="text-muted-foreground mt-4 max-w-xl text-base leading-relaxed sm:text-lg">
          Avsar recommends and prepares. The user decides and sends.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="bg-primary text-primary-foreground inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-medium shadow-sm transition-opacity hover:opacity-90"
          >
            Open dashboard
          </Link>
          <Link
            href="/onboarding"
            className="border-border bg-card text-foreground ring-ring/5 hover:bg-accent inline-flex h-10 items-center justify-center rounded-xl border px-5 text-sm font-medium shadow-sm ring-1 transition-colors"
          >
            Start onboarding
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="border-border bg-card ring-ring/5 hover:bg-accent/60 group rounded-xl border p-5 shadow-sm ring-1 transition-colors"
          >
            <h2 className="text-foreground group-hover:text-accent-foreground text-sm font-semibold">
              {item.title}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{item.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
