"use client";

import { CollapsibleSection } from "@/components/collapsible-section";

import { Textarea } from "@/components/ui/textarea";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { DiscoveryRunsChart } from "@/components/discovery-runs-chart";
import { PeopleDiscoveryStats } from "@/components/people-discovery-stats";
import {
  formatDuration,
  istRunTimes,
  msToNextRun,
  msToNextRunAcross,
  RUN_KINDS,
  RUN_KIND_META,
} from "@/lib/discovery-crons";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FuseButton } from "@/components/ui/fuse-button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  type FileUploadFile,
} from "@/components/ui/file-upload";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { formatDateTimeFixed } from "@/lib/format-datetime";
import { SearchInput } from "@/components/search-input";

/**
 * Admin control surface for job + people discovery. All work runs in FastAPI; this panel
 * queues runs and, while open, drives budgeted ticks so progress is visible. Closing the
 * page is safe — drain crons finish whatever is left.
 */

type RunDto = {
  id: string;
  kind: string;
  runKey: string | null;
  status: string;
  totalItems: number;
  doneItems: number;
  failedItems: number;
  createdBy: string | null;
  createdAt: string;
  finishedAt: string | null;
  totals: Record<string, number>;
  recentErrors?: Array<{ refId: string | null; error: string; attempts: number; status: string }>;
};

type Overview = {
  settings: {
    enabled: boolean;
    dailyLimit: number;
    expiryDays: number;
    ingestMaxMinYears: number;
    experienceWindowYears: number;
    includeInternships: boolean;
    shards: number;
  };
  sourceSummary: { total: number; enabled: number; failing: number; unsupported: number };
  byProvider: Record<string, number>;
  runs: RunDto[];
  openItems: number;
};

type SourceDto = {
  id: string;
  companyName: string;
  provider: string;
  careersUrl: string;
  sector: string | null;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastCounts: { fetched?: number; kept?: number; inserted?: number };
  /** The company's own careers page — the primary source of truth, read on each scan. */
  officialCareersUrl: string | null;
  officialCareersOrigin: "seed" | "admin" | "detected" | null;
  officialStatus: "ok" | "no_job_data" | "blocked" | "error" | null;
  officialCheckedAt: string | null;
};

const OFFICIAL_STATUS_LABELS: Record<NonNullable<SourceDto["officialStatus"]>, string> = {
  ok: "job data read",
  no_job_data: "no job data on the page (checked weekly)",
  blocked: "robots.txt blocks reading it (checked weekly)",
  error: "could not read it last time",
};

const RUN_LABELS: Record<string, string> = {
  jobs_scan: "Job scan",
  people_import: "People import",
  people_discovery: "People discovery",
};

/** What one item of each run kind is, for the Progress column ("32 of 32 boards scanned"). */
const RUN_UNITS: Record<string, { label: string; help: string }> = {
  jobs_scan: {
    label: "boards scanned",
    help: "Company job boards scanned for new roles, of all boards in this run.",
  },
  people_discovery: {
    label: "companies checked",
    help: "Target companies processed (site, GitHub, search, providers), of all companies in this run.",
  },
  people_import: {
    label: "batches imported",
    help: "CSV batches imported, of all batches in this upload.",
  },
};

async function postAction<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/admin/discovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function runProgress(run: RunDto): number {
  if (run.totalItems === 0) return 100;
  return Math.round(((run.doneItems + run.failedItems) / run.totalItems) * 100);
}

/** Hover-card body: when the selected kind's crons run (India time) and the next one. */
function CronScheduleHover({ kind }: { kind: string }) {
  const kinds = kind === "all" ? RUN_KINDS : [kind];
  const scheduled = kinds.filter((k) => (RUN_KIND_META[k]?.scheduleUtcMinutes.length ?? 0) > 0);
  const nextMs =
    kind === "all" ? msToNextRunAcross(scheduled) : scheduled[0] ? msToNextRun(scheduled[0]) : null;

  return (
    <div className="space-y-2 text-[12px]">
      <p className="text-foreground font-medium">Cron schedule · India time</p>
      <ul className="space-y-1">
        {kinds.map((k) => {
          const times = istRunTimes(k);
          return (
            <li key={k} className="flex items-start justify-between gap-3">
              <span className="text-foreground">{RUN_KIND_META[k]?.label ?? k}</span>
              <span className="text-muted-foreground text-right">
                {times.length ? times.join(", ") : "Manual only"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground border-border/60 border-t pt-2">
        {nextMs != null ? (
          <>
            Next run in{" "}
            <span className="text-foreground font-medium">{formatDuration(nextMs)}</span>
          </>
        ) : (
          "No scheduled runs — this kind is manual only."
        )}
      </p>
    </div>
  );
}

export function AdminDiscoveryPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  // Run-discovery fuses: lit = undo window open, burnt out = the action runs.
  const [scanLit, setScanLit] = useState(false);
  const [peopleLit, setPeopleLit] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [runDetail, setRunDetail] = useState<RunDto | null>(null);
  const [csvFiles, setCsvFiles] = useState<FileUploadFile[]>([]);
  const [runKind, setRunKind] = useState<string>("all");
  const [runsPageSize, setRunsPageSize] = useState(5);

  const filteredRuns = useMemo(
    () => (overview?.runs ?? []).filter((r) => runKind === "all" || r.kind === runKind),
    [overview?.runs, runKind],
  );

  const runColumns: DataTableColumn<RunDto>[] = [
    {
      id: "run",
      header: "Run",
      accessorKey: "kind",
      searchable: true,
      enableHiding: false,
      cell: (r) => (
        <button
          type="button"
          className="min-w-0 text-left"
          onClick={() => void openRun(r)}
          title="Open run details"
        >
          <span className="text-foreground block truncate text-[12px] font-medium hover:underline">
            {RUN_LABELS[r.kind] ?? r.kind}
          </span>
          {r.runKey ? (
            <span className="text-muted-foreground block truncate text-[11px]">{r.runKey}</span>
          ) : null}
        </button>
      ),
    },
    {
      id: "progress",
      header: "Progress",
      width: "15rem",
      cell: (r) => {
        const pct = runProgress(r);
        // Same count the percentage uses: finished items, whether they succeeded or failed.
        const processed = r.doneItems + r.failedItems;
        const unit = RUN_UNITS[r.kind] ?? {
          label: "items processed",
          help: "Items processed, of all items in this run.",
        };
        return (
          <div className="min-w-56 space-y-1" title={unit.help}>
            <div className="flex items-baseline gap-2 whitespace-nowrap text-[11px] tabular-nums">
              <span className="text-foreground w-9 shrink-0 font-medium">{pct}%</span>
              <span className="text-muted-foreground truncate">
                {processed} of {r.totalItems} {unit.label}
              </span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        );
      },
    },
    {
      id: "results",
      header: "Results",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {r.failedItems ? (
            <Badge variant="destructive" className="text-[10px] tabular-nums">
              {r.failedItems} failed
            </Badge>
          ) : null}
          {r.kind === "jobs_scan" && r.totals.inserted !== undefined ? (
            <>
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {r.totals.inserted} new jobs
              </Badge>
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {r.totals.recommended ?? 0} recommended
              </Badge>
            </>
          ) : null}
          {r.kind === "people_discovery" && r.totals.created !== undefined ? (
            <>
              <Badge
                variant="outline"
                className="text-[10px] tabular-nums"
                title="New people added to the shared directory in this run."
              >
                {r.totals.created} new people
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] tabular-nums"
                title="Existing people that gained new fields (title, LinkedIn, GitHub, location…)."
              >
                {r.totals.enriched ?? 0} enriched
              </Badge>
              {r.totals.emailsInferred ? (
                <Badge
                  variant="outline"
                  className="text-[10px] tabular-nums"
                  title="Addresses built from the company's email pattern; stored as inferred, never verified."
                >
                  {r.totals.emailsInferred} inferred emails
                </Badge>
              ) : null}
            </>
          ) : null}
          {r.kind === "people_import" && r.totals.created !== undefined ? (
            <>
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {r.totals.created} created
              </Badge>
              {r.totals.enriched ? (
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {r.totals.enriched} enriched
                </Badge>
              ) : null}
            </>
          ) : null}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      sortable: true,
      width: "6.5rem",
      cell: (r) => (
        <Badge
          variant={
            r.status === "done" ? "secondary" : r.status === "failed" ? "destructive" : "default"
          }
          className="text-[10px]"
        >
          {r.status}
        </Badge>
      ),
    },
    {
      id: "started",
      header: "Started",
      accessorKey: "createdAt",
      sortable: true,
      width: "11rem",
      cell: (r) => (
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {formatDateTimeFixed(r.createdAt)}
        </span>
      ),
    },
  ];

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/discovery", { cache: "no-store" });
      const data = (await res.json()) as Overview & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not load discovery status.");
      setOverview(data);
      setLoadError(null);
      return data;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load discovery status.");
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Drive ticks back-to-back while there is open work and the admin keeps the page open. */
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      for (let i = 0; i < 200 && processingRef.current; i++) {
        const tick = await postAction<{ processed: number; remaining: number }>({ action: "tick" });
        await refresh();
        if (tick.remaining === 0 || tick.processed === 0) break;
      }
    } catch (err) {
      toast.add({
        title: "Processing stopped",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [refresh]);

  useEffect(
    () => () => {
      processingRef.current = false;
    },
    [],
  );

  async function run(
    label: string,
    body: Record<string, unknown>,
    then?: (data: Record<string, unknown>) => string,
  ) {
    setBusy(label);
    try {
      const data = await postAction<Record<string, unknown>>(body);
      toast.add({ title: label, description: then?.(data), type: "success" });
      await refresh();
      return data;
    } catch (err) {
      toast.add({
        title: `${label} failed`,
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function startScan() {
    const data = await run("Scan queued", { action: "scan" }, (d) =>
      d.resumed
        ? `A scan is already in progress (${d.sources ?? 0} sources) — resuming it.`
        : `${d.sources ?? 0} career sources queued.`,
    );
    if (data) void processQueue();
  }

  async function startPeopleDiscovery() {
    const data = await run("People discovery queued", { action: "people_discovery" }, (d) =>
      d.resumed
        ? `Discovery already in progress (${d.companies ?? 0} companies) — resuming it.`
        : `${d.companies ?? 0} due companies queued for people discovery.`,
    );
    if (data) void processQueue();
  }

  async function startPeopleImport() {
    const file = csvFiles.find((f) => !f.error)?.file;
    if (!file) return;
    const csv = await file.text();
    const data = await run(
      "People import queued",
      { action: "people_import", csv },
      (d) =>
        `${d.rows} rows in ${d.batches} batches` +
        (Number(d.invalidRows) ? ` · ${d.invalidRows} rows without a name skipped` : "") +
        (Number(d.phonesIgnored) ? ` · ${d.phonesIgnored} phone numbers ignored` : ""),
    );
    if (data) {
      setCsvFiles([]);
      void processQueue();
    }
  }

  async function openRun(run: RunDto) {
    const res = await fetch(`/api/admin/discovery/runs/${run.id}`, { cache: "no-store" });
    const data = (await res.json()) as RunDto;
    setRunDetail(res.ok ? data : run);
  }

  async function retryRun(runId: string) {
    setBusy("Retry");
    try {
      const res = await fetch(`/api/admin/discovery/runs/${runId}`, { method: "POST" });
      const data = (await res.json()) as { requeued?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Retry failed.");
      toast.add({
        title: "Failed items re-queued",
        description: `${data.requeued ?? 0} items`,
        type: "success",
      });
      await refresh();
      void processQueue();
    } catch (err) {
      toast.add({
        title: "Retry failed",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <CollapsibleSection
      title="Discovery"
      summary={`Job and people discovery run in FastAPI. Scheduled scans run nightly (IST) across ${overview?.settings.shards ?? "—"} staggered shards.`}
      headerRight={
        <>
          <FuseButton
            size="sm"
            active={scanLit}
            loading={busy === "Scan queued"}
            disabled={busy !== null}
            onActivate={() => setScanLit(true)}
            onFire={() => {
              setScanLit(false);
              void startScan();
            }}
            onUndo={() => setScanLit(false)}
            title="Queues every enabled source (outside the nightly schedule)"
          >
            Scan all sources now
          </FuseButton>
          <FuseButton
            size="sm"
            variant="outline"
            active={peopleLit}
            loading={busy === "People discovery queued"}
            disabled={busy !== null}
            onActivate={() => setPeopleLit(true)}
            onFire={() => {
              setPeopleLit(false);
              void startPeopleDiscovery();
            }}
            onUndo={() => setPeopleLit(false)}
            title="Find people at the next due companies (from applications and jobs) using public sources"
          >
            Discover people now
          </FuseButton>
          <Button
            size="sm"
            variant="outline"
            loading={busy === "Expiry"}
            disabled={busy !== null}
            onClick={() =>
              void run(
                "Expiry",
                { action: "expire" },
                (d) =>
                  `${d.jobsExpired} jobs expired · ${d.applicationsRejected} applications marked rejected`,
              )
            }
          >
            Run expiry
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={busy === "Ranking"}
            disabled={busy !== null}
            onClick={() =>
              void run(
                "Ranking",
                { action: "rank" },
                (d) => `${d.recommended} new recommendations for ${d.users} users`,
              )
            }
          >
            Rank now
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>Discovery service error</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}

        {!overview && !loadError ? <Skeleton className="h-40 w-full" /> : null}

        {overview ? (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-[13px]">Queue & settings</CardTitle>
                  <CardDescription className="text-[11px]">
                    Env-configured in the API. Recommendations: up to {overview.settings.dailyLimit}
                    /user/day.
                  </CardDescription>
                  <CardAction>
                    <Badge variant={overview.settings.enabled ? "default" : "destructive"}>
                      {overview.settings.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">Expiry {overview.settings.expiryDays}d</Badge>
                    <Badge variant="secondary">
                      YOE window +{overview.settings.experienceWindowYears}
                    </Badge>
                    <Badge variant="secondary">
                      Internships {overview.settings.includeInternships ? "included" : "excluded"}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px]">
                      <span className="text-foreground font-semibold tabular-nums">
                        {overview.openItems}
                      </span>{" "}
                      <span className="text-muted-foreground">items waiting</span>
                    </p>
                    {processing ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => (processingRef.current = false)}
                      >
                        Pause processing
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={overview.openItems === 0}
                        onClick={() => void processQueue()}
                      >
                        Process now
                      </Button>
                    )}
                  </div>
                  {processing ? (
                    <p className="text-muted-foreground text-[11px]">
                      Processing in ~40s ticks while this page is open…
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-[13px]">Career sources</CardTitle>
                  <CardDescription className="text-[11px]">
                    Public ATS boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workable) and
                    career pages with JobPosting data. Tech roles are stored worldwide (India first)
                    up to {overview.settings.ingestMaxMinYears} yrs minimum experience.
                  </CardDescription>
                  <CardAction>
                    <Button size="xs" variant="outline" onClick={() => setSourcesOpen(true)}>
                      Manage
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>{overview.sourceSummary.enabled ?? 0} enabled</Badge>
                    <Badge variant="secondary">{overview.sourceSummary.total ?? 0} total</Badge>
                    {overview.sourceSummary.failing ? (
                      <Badge variant="destructive">{overview.sourceSummary.failing} failing</Badge>
                    ) : null}
                    {overview.sourceSummary.unsupported ? (
                      <Badge variant="outline">
                        {overview.sourceSummary.unsupported} unsupported pages
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(overview.byProvider).map(([provider, n]) => (
                      <Badge key={provider} variant="outline" className="text-[10px]">
                        {provider} · {n}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <PeopleDiscoveryStats />

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-[13px]">Bulk people discovery</CardTitle>
                  <CardDescription className="text-[11px]">
                    Upload a CSV with a header row: name (required), company, role, email, linkedin,
                    source_url. Rows are matched by LinkedIn → email → name + company and only fill
                    empty fields. Emails are stored as unverified; phone numbers are ignored.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FileUpload
                    accept=".csv,text/csv"
                    maxSize={4 * 1024 * 1024}
                    files={csvFiles}
                    onFilesChange={setCsvFiles}
                  >
                    <FileUploadDropzone className="min-h-24">
                      <span className="text-[12px]">
                        Drop a CSV here or click to choose (max 4 MB)
                      </span>
                    </FileUploadDropzone>
                    <FileUploadList />
                  </FileUpload>
                  <Button
                    size="sm"
                    disabled={!csvFiles.some((f) => !f.error) || busy !== null}
                    loading={busy === "People import queued"}
                    onClick={() => void startPeopleImport()}
                  >
                    Start import
                  </Button>
                </CardContent>
              </Card>
            </div>

            <section className="space-y-3" aria-label="Discovery runs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-foreground text-[13px] font-semibold tracking-tight">Runs</h3>
                  <p className="text-muted-foreground text-[11px]">
                    The filter applies to both the chart and the list below.
                  </p>
                </div>
                <HoverCard>
                  <HoverCardTrigger>
                    <ToggleGroup
                      aria-label="Filter runs by kind"
                      variant="outline"
                      size="sm"
                      spacing={1}
                      value={[runKind]}
                      onValueChange={(next) => setRunKind(next[0] ?? "all")}
                    >
                      <ToggleGroupItem value="all" className="h-7 rounded-full px-2.5 text-[11px]">
                        All
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="jobs_scan"
                        className="h-7 rounded-full px-2.5 text-[11px]"
                      >
                        Jobs
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="people_discovery"
                        className="h-7 rounded-full px-2.5 text-[11px]"
                      >
                        People discovery
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="people_import"
                        className="h-7 rounded-full px-2.5 text-[11px]"
                      >
                        People import
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72" align="end">
                    <CronScheduleHover kind={runKind} />
                  </HoverCardContent>
                </HoverCard>
              </div>

              <DiscoveryRunsChart kind={runKind} />

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-[13px]">Recent runs</CardTitle>
                  <CardDescription className="text-[11px]">
                    Resumable: failed items retry automatically up to 3 times.
                  </CardDescription>
                  <CardAction>
                    <ToggleGroup
                      aria-label="Runs per page"
                      variant="outline"
                      size="sm"
                      // spacing={1}
                      value={[String(runsPageSize)]}
                      onValueChange={(next) => {
                        const n = Number(next[0]);
                        if (n) setRunsPageSize(n);
                      }}
                    >
                      {[5, 10, 20].map((n) => (
                        <ToggleGroupItem
                          key={n}
                          value={String(n)}
                          className="h-7 rounded-full px-2.5 text-[11px]"
                        >
                          {n}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={runColumns}
                    data={filteredRuns}
                    getRowId={(r) => r.id}
                    searchable
                    searchPlaceholder="Search run kind…"
                    pagination={runsPageSize}
                    emptyMessage="No runs match this filter."
                    renderRowActions={(r) =>
                      r.failedItems > 0 ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => void retryRun(r.id)}
                        >
                          Retry
                        </Button>
                      ) : null
                    }
                    actionsWidth="5rem"
                  />
                </CardContent>
              </Card>
            </section>
          </>
        ) : null}

        <SourcesSheet
          open={sourcesOpen}
          onClose={() => setSourcesOpen(false)}
          onChanged={() => void refresh()}
        />

        <Sheet
          open={runDetail !== null}
          onOpenChange={(next) => {
            if (!next) setRunDetail(null);
          }}
        >
          <SheetContent className="w-full max-w-md sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="aavedak-display text-lg font-normal">
                {runDetail ? (RUN_LABELS[runDetail.kind] ?? runDetail.kind) : "Run"}
              </SheetTitle>
              <SheetDescription className="text-[12px] leading-relaxed">
                {runDetail?.runKey ?? runDetail?.id}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1">
              {runDetail ? (
                <div className="space-y-3 text-[12px]">
                  <Progress value={runProgress(runDetail)} />
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(runDetail.totals).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="text-[10px]">
                        {k}: {v}
                      </Badge>
                    ))}
                  </div>
                  <Separator />
                  <p className="text-foreground font-medium">Recent errors</p>
                  {runDetail.recentErrors?.length ? (
                    <ul className="space-y-1.5">
                      {runDetail.recentErrors.map((e, i) => (
                        <li key={`${e.refId}-${i}`} className="text-muted-foreground">
                          <span className="text-foreground">{e.status}</span> · attempt {e.attempts}{" "}
                          · {e.error}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">None.</p>
                  )}
                </div>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </CollapsibleSection>
  );
}

function SourcesSheet({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<SourceDto[] | null>(null);
  const [importText, setImportText] = useState("");
  // Keyed by action so only the pressed button shows its spinner; the other just disables.
  const [pendingImport, setPendingImport] = useState<"urls" | "seed" | null>(null);
  // Official careers page editor: one source at a time.
  const [editingOfficial, setEditingOfficial] = useState<{ id: string; url: string } | null>(null);
  const [savingOfficialId, setSavingOfficialId] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    const res = await fetch(`/api/admin/discovery/sources?q=${encodeURIComponent(q)}&limit=200`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { sources?: SourceDto[]; error?: string };
    setSources(res.ok ? (data.sources ?? []) : []);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(query), 250);
    return () => clearTimeout(t);
  }, [open, query, load]);

  async function toggle(source: SourceDto, enabled: boolean) {
    setSources((list) => list?.map((s) => (s.id === source.id ? { ...s, enabled } : s)) ?? null);
    const res = await fetch(`/api/admin/discovery/sources/${source.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      toast.add({ title: "Could not update source", type: "error" });
      void load(query);
    } else {
      onChanged();
    }
  }

  async function saveOfficial(source: SourceDto, url: string) {
    setSavingOfficialId(source.id);
    try {
      const res = await fetch(`/api/admin/discovery/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officialCareersUrl: url.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.add({ title: data.error || "Could not save the careers page", type: "error" });
        return;
      }
      setEditingOfficial(null);
      void load(query);
      onChanged();
    } finally {
      setSavingOfficialId(null);
    }
  }

  async function importSources(seed: boolean) {
    setPendingImport(seed ? "seed" : "urls");
    try {
      const res = seed
        ? await fetch("/api/admin/discovery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "import_seed" }),
          })
        : await fetch("/api/admin/discovery/sources", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: importText }),
          });
      const data = (await res.json()) as {
        added?: number;
        existing?: number;
        invalid?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Import failed.");
      toast.add({
        title: `${data.added ?? 0} sources added`,
        description: `${data.existing ?? 0} already present${data.invalid?.length ? ` · ${data.invalid.length} lines not recognised` : ""}`,
        type: "success",
      });
      if (!seed) setImportText("");
      void load(query);
      onChanged();
    } catch (err) {
      toast.add({
        title: "Import failed",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    } finally {
      setPendingImport(null);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full max-w-lg sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="aavedak-display text-lg font-normal">Career sources</SheetTitle>
          <SheetDescription className="text-[12px] leading-relaxed">
            Enable, disable, or add career pages.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-foreground text-[12px] font-medium">Add career pages</p>
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={4}
                placeholder={
                  "One per line: URL, or Company, URL[, software|core|mixed]\nhttps://jobs.lever.co/acme\nAcme Motors, https://www.acme.in/careers, core"
                }
                className="py-2 font-mono text-[12px]"
              />
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  loading={pendingImport === "urls"}
                  disabled={!importText.trim() || pendingImport !== null}
                  onClick={() => void importSources(false)}
                >
                  Import
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={pendingImport === "seed"}
                  disabled={pendingImport !== null}
                  onClick={() => void importSources(true)}
                >
                  Re-import verified seed list
                </Button>
              </div>
            </div>
            <Separator />
            <SearchInput
              className="h-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company or token…"
              aria-label="Search sources"
            />
            {sources === null ? (
              <Skeleton className="h-32 w-full" />
            ) : sources.length === 0 ? (
              <p className="text-muted-foreground text-[12px]">No sources match.</p>
            ) : (
              <ul className="space-y-2">
                {sources.map((s) => (
                  <li
                    key={s.id}
                    className="border-border flex items-start gap-2.5 rounded-md border px-2.5 py-2"
                  >
                    <Checkbox
                      checked={s.enabled}
                      onChange={(e) => void toggle(s, e.target.checked)}
                      aria-label={`Enable ${s.companyName}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground flex flex-wrap items-center gap-1.5 text-[12px] font-medium">
                        {s.companyName}
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {s.provider}
                        </Badge>
                        {s.sector ? (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            {s.sector}
                          </Badge>
                        ) : null}
                      </p>
                      <a
                        href={s.careersUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground block truncate text-[11px] hover:underline"
                      >
                        {s.careersUrl}
                      </a>
                      {editingOfficial?.id === s.id ? (
                        <form
                          className="mt-1 flex items-center gap-1.5"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveOfficial(s, editingOfficial.url);
                          }}
                        >
                          <Input
                            value={editingOfficial.url}
                            onChange={(e) => setEditingOfficial({ id: s.id, url: e.target.value })}
                            placeholder="https://company.com/careers"
                            aria-label={`Official careers page for ${s.companyName}`}
                            className="h-7 text-[11px]"
                            autoFocus
                          />
                          <Button
                            type="submit"
                            size="sm"
                            className="h-7"
                            loading={savingOfficialId === s.id}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            disabled={savingOfficialId === s.id}
                            onClick={() => setEditingOfficial(null)}
                          >
                            Cancel
                          </Button>
                        </form>
                      ) : (
                        <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-[11px]">
                          <span className="text-foreground/80 font-medium">Careers page:</span>
                          {s.officialCareersUrl ? (
                            <>
                              <a
                                href={s.officialCareersUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="max-w-56 truncate hover:underline"
                              >
                                {s.officialCareersUrl}
                              </a>
                              {s.officialCareersOrigin ? (
                                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                  {s.officialCareersOrigin}
                                </Badge>
                              ) : null}
                              <span>
                                ·{" "}
                                {s.officialStatus
                                  ? OFFICIAL_STATUS_LABELS[s.officialStatus]
                                  : "not read yet"}
                              </span>
                            </>
                          ) : (
                            <span>not set</span>
                          )}
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto text-[11px]"
                            onClick={() =>
                              setEditingOfficial({ id: s.id, url: s.officialCareersUrl ?? "" })
                            }
                          >
                            {s.officialCareersUrl ? "Edit" : "Add"}
                          </Button>
                        </p>
                      )}
                      <p className="text-muted-foreground text-[11px]">
                        {s.lastSuccessAt
                          ? `Last OK ${formatDateTimeFixed(s.lastSuccessAt)}`
                          : "Never scanned"}
                        {s.lastCounts.fetched !== undefined
                          ? ` · ${s.lastCounts.fetched} fetched · ${s.lastCounts.kept ?? 0} kept`
                          : ""}
                      </p>
                      {s.lastError ? (
                        <p className="text-destructive text-[11px]">
                          {s.lastError}
                          {s.consecutiveFailures > 1 ? ` (${s.consecutiveFailures}× in a row)` : ""}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
