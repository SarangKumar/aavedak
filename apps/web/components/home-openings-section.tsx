"use client";

import Link from "next/link";
import { useState } from "react";

import { OpeningsGlobe } from "@/components/openings-globe";
import { jobsSearchHref, type JobMapSummary } from "@/lib/job-map/locations";

function formatCount(n: number): string {
  return n.toLocaleString("en-IN");
}

/**
 * Homepage band: a few plain words and numbers on the left, the openings globe on the right.
 * Counts only — no job details — so every visitor, signed in or not, sees the same thing.
 * Hovering or focusing a city label shows that city on the left; labels and "See jobs in…"
 * open Jobs searched by the city. No region in the copy — coverage will grow.
 */
export function HomeOpeningsSection({ summary }: { summary: JobMapSummary }) {
  const { cities } = summary;
  const [activeId, setActiveId] = useState<string | null>(cities[0]?.id ?? null);
  const active = cities.find((c) => c.id === activeId) ?? cities[0] ?? null;

  const stats = [
    { value: cities.length, label: cities.length === 1 ? "city" : "cities" },
    {
      value: summary.companyCount,
      label: summary.companyCount === 1 ? "company hiring" : "companies hiring",
    },
  ];

  return (
    <section
      className="aavedak-home-section aavedak-fade-up aavedak-fade-up-delay-3"
      aria-labelledby="openings-heading"
    >
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_2fr] lg:gap-10">
        <div className="flex min-w-0 flex-col items-center text-center lg:items-start lg:text-left">
          <h2
            id="openings-heading"
            className="aavedak-display text-foreground text-2xl leading-tight sm:text-3xl"
          >
            Where the roles are
          </h2>
          <p className="text-muted-foreground mt-2.5 max-w-sm text-balance text-[14px] leading-relaxed">
            Aavedak checks company career pages through the day, so new openings show up here first.
          </p>

          <dl className="mt-6 flex gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-foreground text-2xl font-semibold tabular-nums tracking-tight">
                  {formatCount(stat.value)}
                </dd>
                <dd className="text-muted-foreground text-[12px]">{stat.label}</dd>
              </div>
            ))}
          </dl>

          {active ? (
            // Follows the city hovered on the globe; announced politely for screen readers.
            <div className="mt-6 flex flex-col gap-1" aria-live="polite">
              <p className="text-[14px]">
                <span className="text-foreground font-semibold">{active.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatCount(active.count)} open {active.count === 1 ? "role" : "roles"}
                </span>
              </p>
              <Link
                href={jobsSearchHref(active.name)}
                className="text-primary text-[13px] font-medium hover:underline"
              >
                See jobs in {active.name} →
              </Link>
            </div>
          ) : null}
        </div>

        <div className="max-w-160 relative mx-auto w-full">
          <OpeningsGlobe
            cities={cities}
            activeId={active?.id ?? null}
            onActiveChange={setActiveId}
          />
        </div>
      </div>
    </section>
  );
}
