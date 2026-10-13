"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = {
  people: {
    total: number;
    discovered: number;
    withLinkedin: number;
    withGithub: number;
    withEmail: number;
    withTitle: number;
    withLocation: number;
    seenLast7Days: number;
  };
  bySource: Record<string, number>;
  emails: Record<string, number>;
  emailPatterns: number;
  targets: { total: number; due: number; never: number; from_applications: number };
  openItems: number;
  sources: Record<string, boolean>;
  limits: { companiesPerRun: number; requestsPerCompany: number; refreshDays: number };
};

const SOURCE_NAMES: Record<string, string> = {
  companySite: "Company sites",
  github: "GitHub",
  githubToken: "GitHub token",
  brave: "Brave Search",
  serpapi: "SerpAPI",
  googleCse: "Google CSE",
  hunter: "Hunter",
  apollo: "Apollo",
};

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="min-w-24" title={hint}>
      <div className="text-foreground text-[15px] font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[11px]">{label}</div>
    </div>
  );
}

/** People discovery coverage: who we know, from where, and which sources are configured. */
export function PeopleDiscoveryStats({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/discovery?view=people-stats", { cache: "no-store" });
      const data = (await res.json()) as Stats & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not load people stats.");
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load people stats.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-[13px]">People discovery</CardTitle>
        <CardDescription className="text-[11px]">
          Recruiters, hiring managers and engineers at companies users apply to, from company sites,
          GitHub, search APIs and providers. Runs about every 4 hours (six daily Vercel crons) plus
          a daily fallback; each run takes the next due companies.
        </CardDescription>
        <CardAction>
          <Button size="xs" variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-destructive text-[12px]">{error}</p> : null}
        {!stats && !error ? <Skeleton className="h-16 w-full" /> : null}
        {stats ? (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Stat label="people" value={stats.people.total} />
              <Stat label="discovered" value={stats.people.discovered} />
              <Stat label="with title" value={stats.people.withTitle} />
              <Stat
                label="with email"
                value={stats.people.withEmail}
                hint="Published or provider-reported"
              />
              <Stat
                label="inferred emails"
                value={stats.emails.inferred ?? 0}
                hint="From the company's email pattern; never marked verified"
              />
              <Stat label="LinkedIn" value={stats.people.withLinkedin} />
              <Stat label="GitHub" value={stats.people.withGithub} />
              <Stat label="seen in 7 days" value={stats.people.seenLast7Days} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Stat
                label="target companies"
                value={stats.targets.total}
                hint="From applications and live jobs"
              />
              <Stat label="due now" value={stats.targets.due} />
              <Stat label="never checked" value={stats.targets.never} />
              <Stat label="email patterns" value={stats.emailPatterns} />
              <Stat label="queued items" value={stats.openItems} />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground mr-1 text-[11px]">People by source:</span>
              {Object.entries(stats.bySource).map(([k, n]) => (
                <Badge key={k} variant="outline" className="text-[10px] tabular-nums">
                  {k} · {n}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground mr-1 text-[11px]">Sources:</span>
              {Object.entries(stats.sources).map(([k, on]) => (
                <Badge
                  key={k}
                  variant={on ? "secondary" : "outline"}
                  className="text-[10px]"
                  title={on ? "Configured" : "Not configured (key missing)"}
                >
                  {SOURCE_NAMES[k] ?? k} {on ? "✓" : "—"}
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground text-[11px]">
              Limits: {stats.limits.companiesPerRun} companies per run ·{" "}
              {stats.limits.requestsPerCompany} requests per company · refresh every{" "}
              {stats.limits.refreshDays} days.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
