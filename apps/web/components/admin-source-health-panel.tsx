"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CollapsibleSection } from "@/components/collapsible-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { strategyLabel } from "@/lib/careers-pages";
import { formatDateTimeFixed } from "@/lib/format-datetime";

type HealthReport = {
  boards: Record<string, number | string | null>;
  boardsByAts: Array<{
    ats: string;
    configured: number;
    succeeded: number;
    failing: number;
    postingsLastScan: number;
    lastSuccessAt: string | null;
  }>;
  careersPages: Record<string, number | string | null>;
  careersPagesByStrategy: Array<{
    strategy: string;
    pages: number;
    jobsFound: number;
    jobsKept: number;
  }>;
  jobs: Record<string, number>;
  validation: Record<string, number>;
  companyDiscovery: Record<string, number>;
  outageGuarded: Array<{ company: string; ats: string; lastCount: number | null }>;
};

type CandidateRow = {
  id: string;
  name: string;
  domain: string | null;
  careersUrl: string | null;
  ats: string | null;
  atsToken: string | null;
  discoverySource: string;
  status: "pending" | "board" | "careers_page" | "none" | "error";
  lastError: string | null;
  attempts: number;
  checkedAt: string | null;
  registeredSourceId: string | null;
  registeredPageId: string | null;
};

type LedgerResponse = {
  candidates: CandidateRow[];
  summary: Record<string, number>;
  bySource: Record<string, number>;
};

const PAGE_SIZES = [5, 10] as const;

const STATUS_LABELS: Record<CandidateRow["status"], string> = {
  pending: "Not checked yet",
  board: "Board found",
  careers_page: "Careers page found",
  none: "Nothing found",
  error: "Error",
};

const STATUS_VARIANT: Record<CandidateRow["status"], BadgeVariant> = {
  pending: "outline",
  board: "engineNative",
  careers_page: "secondary",
  none: "outline",
  error: "destructive",
};

const SOURCE_LABELS: Record<string, string> = {
  workable_index: "Workable index",
  applications: "A user applied",
  shared_jobs: "Shared job",
  careers_embed: "Careers-page embed",
};

function number(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function StatGrid({
  stats,
}: {
  stats: Array<{ label: string; value: number | undefined; help?: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className="border-border/80 bg-card gap-0 rounded-xl border px-3 py-2 shadow-sm"
          title={stat.help}
        >
          <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            {stat.label}
          </p>
          {stat.value === undefined ? (
            <Skeleton className="mt-1 h-5 w-10" />
          ) : (
            <p className="text-foreground mt-0.5 font-mono text-lg tabular-nums">{stat.value}</p>
          )}
        </Card>
      ))}
    </div>
  );
}

/**
 * Admin → Source health: one page answering "is ingest working?". Coverage and success rate
 * per hiring platform, what each careers-page strategy produced, job counts, the validation
 * problems in stored jobs, and the company-discovery ledger with a button to run it now.
 */
export function AdminSourceHealthPanel() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, ledgerRes] = await Promise.all([
        fetch("/api/admin/discovery/health", { cache: "no-store" }),
        fetch("/api/admin/discovery/discovered-companies", { cache: "no-store" }),
      ]);
      const healthBody = (await healthRes.json().catch(() => null)) as
        (HealthReport & { error?: string }) | null;
      if (!healthRes.ok || !healthBody)
        throw new Error(healthBody?.error ?? `Request failed (${healthRes.status}).`);
      const ledgerBody = (await ledgerRes.json().catch(() => null)) as
        (LedgerResponse & { error?: string }) | null;
      setHealth(healthBody);
      setLedger(ledgerRes.ok ? ledgerBody : null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the source-health report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const discoverNow = useCallback(async () => {
    setDiscovering(true);
    try {
      const res = await fetch("/api/admin/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "company_discovery" }),
      });
      const body = (await res.json().catch(() => null)) as {
        queued?: number;
        collected?: number;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
      toast.add({
        title: "Company discovery started",
        description: `${body?.collected ?? 0} new candidates collected, ${body?.queued ?? 0} queued.`,
      });
      await refresh();
    } catch (err) {
      toast.add({
        title: "Could not start company discovery",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    } finally {
      setDiscovering(false);
    }
  }, [refresh]);

  const columns = useMemo<DataTableColumn<CandidateRow>[]>(
    () => [
      {
        id: "company",
        header: "Company",
        accessorKey: "name",
        sortable: true,
        searchable: true,
        width: "12rem",
        cell: (r) => (
          <div className="min-w-0">
            <p className="text-foreground truncate text-[12px] font-medium">{r.name}</p>
            <p className="text-muted-foreground truncate text-[10px]">{r.domain ?? "No domain"}</p>
          </div>
        ),
      },
      {
        id: "source",
        header: "Found via",
        accessorKey: "discoverySource",
        sortable: true,
        searchable: true,
        width: "9rem",
        cell: (r) => (
          <Badge variant="outline" className="text-[10px]">
            {SOURCE_LABELS[r.discoverySource] ?? r.discoverySource}
          </Badge>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        sortable: true,
        searchable: true,
        width: "9.5rem",
        cell: (r) => (
          <Badge
            variant={STATUS_VARIANT[r.status]}
            className="text-[10px]"
            title={r.lastError ?? undefined}
          >
            {STATUS_LABELS[r.status]}
          </Badge>
        ),
      },
      {
        id: "resolved",
        header: "Resolved to",
        accessorKey: "ats",
        searchable: true,
        cell: (r) =>
          r.ats || r.careersUrl ? (
            <div className="min-w-0">
              {r.ats ? (
                <p className="text-foreground truncate text-[11px]">
                  {strategyLabel(r.ats)}
                  {r.atsToken ? (
                    <span className="text-muted-foreground font-mono"> · {r.atsToken}</span>
                  ) : null}
                </p>
              ) : null}
              {r.careersUrl ? (
                <a
                  href={r.careersUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex max-w-full cursor-pointer items-center gap-1 truncate text-[10px] hover:underline"
                  title={r.careersUrl}
                >
                  <span className="truncate">
                    {r.careersUrl.replace(/^https?:\/\/(www\.)?/, "")}
                  </span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              ) : null}
            </div>
          ) : (
            <span className="text-muted-foreground text-[11px]">—</span>
          ),
      },
      {
        id: "registered",
        header: "Registered",
        width: "7rem",
        cell: (r) => (
          <span className="text-[11px]">
            {r.registeredSourceId ? "Board" : r.registeredPageId ? "Page" : "—"}
          </span>
        ),
      },
      {
        id: "checked",
        header: "Last checked",
        accessorKey: "checkedAt",
        sortable: true,
        width: "8.5rem",
        cell: (r) => (
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {formatDateTimeFixed(r.checkedAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const boards = health?.boards;
  const pages = health?.careersPages;
  const jobs = health?.jobs;
  const validation = health?.validation;
  const ledgerSummary = ledger?.summary;

  const coverage: Array<{ label: string; value: number | undefined; help?: string }> = [
    {
      label: "Boards",
      value: number(boards?.configured),
      help: "Hiring-platform boards configured",
    },
    {
      label: "Board OK",
      value: number(boards?.succeededThisWeek),
      help: "Boards that succeeded in the last 7 days",
    },
    {
      label: "Board failing",
      value: number(boards?.failing),
      help: "Enabled boards whose last scan errored",
    },
    { label: "Careers pages", value: number(pages?.configured) },
    {
      label: "Pages read",
      value: number(pages?.ok),
      help: "Pages whose last crawl returned job data",
    },
    {
      label: "Candidates",
      value: number(ledgerSummary?.total),
      help: "Companies in the discovery ledger",
    },
  ];

  const flow: Array<{ label: string; value: number | undefined; help?: string }> = [
    { label: "Active jobs", value: number(jobs?.active) },
    { label: "Added 24h", value: number(jobs?.addedLast24h) },
    { label: "Updated 24h", value: number(jobs?.updatedLast24h) },
    {
      label: "Closed 24h",
      value: number(jobs?.closedLast24h),
      help: "No longer listed by a complete scan",
    },
    { label: "Expired 24h", value: number(jobs?.expiredLast24h) },
    {
      label: "Not re-listed",
      value: number(validation?.notRelistedRecently),
      help: `Open jobs no source has listed for ${validation?.staleAfterDays ?? 10}+ days`,
    },
  ];

  const problems: Array<{ label: string; value: number | undefined; help?: string }> = [
    { label: "Bad links", value: number(validation?.invalidUrl) },
    { label: "Blank titles", value: number(validation?.invalidTitle) },
    { label: "No description", value: number(validation?.emptyDescription) },
    {
      label: "Short description",
      value: number(validation?.shortDescription),
      help: "Under 200 characters",
    },
    {
      label: "Duplicate groups",
      value: number(validation?.duplicateGroups),
      help: "Open jobs sharing a dedupe key",
    },
    { label: "Duplicate extras", value: number(validation?.duplicateExtras) },
  ];

  const lastSuccess = typeof boards?.lastSuccessAt === "string" ? boards.lastSuccessAt : null;

  return (
    <CollapsibleSection
      title="Source health"
      summary={
        boards
          ? `${number(boards.configured) ?? 0} boards and ${number(pages?.configured) ?? 0} careers pages configured; last successful board scan ${formatDateTimeFixed(lastSuccess)}.`
          : "Coverage and success per hiring platform, job flow, and the validation problems in stored jobs."
      }
      headerRight={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            loading={discovering}
            disabled={discovering}
            onClick={() => void discoverNow()}
          >
            Discover companies
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={loading}
            disabled={loading}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="text-[12px]">{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-foreground text-[13px] font-semibold tracking-tight">Coverage</h3>
          <StatGrid stats={coverage} />
          {health?.boardsByAts.length ? (
            <div
              className="flex flex-wrap items-center gap-1.5"
              aria-label="Boards by hiring platform"
            >
              <span className="text-muted-foreground text-[11px]">Per platform:</span>
              {health.boardsByAts.map((row) => (
                <Badge
                  key={row.ats}
                  variant={row.failing > 0 ? "secondary" : "outline"}
                  className="text-[10px]"
                  title={`Last success ${formatDateTimeFixed(row.lastSuccessAt)} · ${row.postingsLastScan} postings on the last scan`}
                >
                  {strategyLabel(row.ats)} · {row.succeeded}/{row.configured} ok
                  {row.failing ? ` · ${row.failing} failing` : ""}
                </Badge>
              ))}
            </div>
          ) : null}
          {health?.careersPagesByStrategy.length ? (
            <div
              className="flex flex-wrap items-center gap-1.5"
              aria-label="Careers pages by strategy"
            >
              <span className="text-muted-foreground text-[11px]">How pages are read:</span>
              {health.careersPagesByStrategy.map((row) => (
                <Badge key={row.strategy} variant="secondary" className="text-[10px]">
                  {strategyLabel(row.strategy)} · {row.pages} · {row.jobsKept} kept
                </Badge>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="text-foreground text-[13px] font-semibold tracking-tight">Job flow</h3>
          <StatGrid stats={flow} />
          {health?.outageGuarded.length ? (
            <Alert>
              <AlertDescription className="text-[12px]">
                The outage guard refused to close jobs for{" "}
                {health.outageGuarded.map((row) => row.company).join(", ")} — each returned far
                fewer postings than its previous scan. Nothing was closed; the next scan decides.
              </AlertDescription>
            </Alert>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="text-foreground text-[13px] font-semibold tracking-tight">
            Validation problems
          </h3>
          <StatGrid stats={problems} />
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-foreground text-[13px] font-semibold tracking-tight">
              Discovered companies
            </h3>
            {ledgerSummary ? (
              <p className="text-muted-foreground text-[11px]">
                {ledgerSummary.boardsRegistered} boards and {ledgerSummary.pagesRegistered} careers
                pages added from {ledgerSummary.total} candidates · {ledgerSummary.pending} not
                checked yet
              </p>
            ) : null}
          </div>
          <DataTable
            columns={columns}
            data={ledger?.candidates ?? []}
            getRowId={(r) => r.id}
            loading={loading && !ledger}
            searchable
            searchPlaceholder="Search company, domain, platform or status…"
            pagination={PAGE_SIZES[0]}
            pageSizeOptions={PAGE_SIZES}
            pageSizeLabel="Candidates per page"
            emptyMessage="No candidates yet — discovery collects them during the next scan."
          />
        </section>
      </div>
    </CollapsibleSection>
  );
}
