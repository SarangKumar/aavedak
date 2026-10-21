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
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { STATUS_LABELS, strategyLabel, type CareersPageStatus } from "@/lib/careers-pages";
import { formatDateTimeFixed } from "@/lib/format-datetime";

type CareersPageRow = {
  id: string;
  companyName: string;
  careersUrl: string;
  domain: string;
  countryFocus: "india" | "india_office" | "global";
  tier: number;
  enabled: boolean;
  strategy: string | null;
  platformToken: string | null;
  lastCheckedAt: string | null;
  lastStatus: CareersPageStatus | null;
  lastError: string | null;
  complete: boolean;
  jobsFound: number;
  jobsKept: number;
  boardProvider: string | null;
};

type CareersPagesResponse = {
  pages: CareersPageRow[];
  summary: Record<string, number>;
  byStrategy: Array<{ strategy: string; label: string; pages: number; jobs: number }>;
};

const PAGE_SIZES = [5, 10] as const;

const STATUS_VARIANT: Record<CareersPageStatus, BadgeVariant> = {
  ok: "engineNative",
  no_job_data: "outline",
  blocked: "secondary",
  error: "destructive",
};

const FOCUS_LABELS: Record<CareersPageRow["countryFocus"], string> = {
  india: "India",
  india_office: "India office",
  global: "Global",
};

/** Admin → Careers pages: the registry of companies' own careers pages (the primary job
 * source), what the last crawl found, and an enabled toggle per page. */
export function AdminCareersPagesPanel() {
  const [data, setData] = useState<CareersPagesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Keyed by page id so only the toggled row's switch is pending.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/discovery/careers-pages", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as
        (CareersPagesResponse & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status}).`);
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load careers pages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setEnabled = useCallback(async (row: CareersPageRow, enabled: boolean) => {
    setPendingId(row.id);
    try {
      const res = await fetch(`/api/admin/discovery/careers-pages/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error();
      setData((prev) =>
        prev
          ? { ...prev, pages: prev.pages.map((p) => (p.id === row.id ? { ...p, enabled } : p)) }
          : prev,
      );
    } catch {
      toast.add({ title: `Could not update ${row.companyName}`, type: "error" });
    } finally {
      setPendingId(null);
    }
  }, []);

  const columns = useMemo<DataTableColumn<CareersPageRow>[]>(
    () => [
      {
        id: "company",
        header: "Company",
        accessorKey: "companyName",
        sortable: true,
        searchable: true,
        width: "11rem",
        cell: (r) => (
          <div className="min-w-0">
            <p className="text-foreground truncate text-[12px] font-medium">{r.companyName}</p>
            <p className="text-muted-foreground text-[10px]">{FOCUS_LABELS[r.countryFocus]}</p>
          </div>
        ),
      },
      {
        id: "url",
        header: "Careers page",
        accessorKey: "careersUrl",
        searchable: true,
        cell: (r) => (
          <a
            href={r.careersUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex max-w-full cursor-pointer items-center gap-1 truncate text-[11px] hover:underline"
            title={r.careersUrl}
          >
            <span className="truncate">{r.careersUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        ),
      },
      {
        id: "strategy",
        header: "Strategy",
        accessorKey: "strategy",
        sortable: true,
        searchable: true,
        width: "10rem",
        cell: (r) =>
          r.strategy ? (
            <div className="min-w-0">
              <Badge variant="outline" className="text-[10px]">
                {strategyLabel(r.strategy)}
              </Badge>
              {r.platformToken ? (
                <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">
                  {r.platformToken}
                </p>
              ) : null}
            </div>
          ) : (
            <span className="text-muted-foreground text-[11px]">—</span>
          ),
      },
      {
        id: "checked",
        header: "Last checked",
        accessorKey: "lastCheckedAt",
        sortable: true,
        width: "8.5rem",
        cell: (r) => (
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {formatDateTimeFixed(r.lastCheckedAt)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "lastStatus",
        sortable: true,
        searchable: true,
        width: "7.5rem",
        cell: (r) =>
          r.lastStatus ? (
            <Badge
              variant={STATUS_VARIANT[r.lastStatus]}
              className="text-[10px]"
              title={r.lastError ?? undefined}
            >
              {STATUS_LABELS[r.lastStatus]}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-[11px]">Not crawled</span>
          ),
      },
      {
        id: "jobs",
        header: "Jobs",
        accessorKey: "jobsFound",
        sortable: true,
        width: "6rem",
        cell: (r) => (
          <span className="text-[11px] tabular-nums" title="Postings found · kept after filters">
            {r.jobsFound} <span className="text-muted-foreground">· {r.jobsKept}</span>
          </span>
        ),
      },
      {
        id: "enabled",
        header: "Enabled",
        width: "5rem",
        enableHiding: false,
        cell: (r) => (
          <Switch
            checked={r.enabled}
            disabled={pendingId === r.id}
            aria-label={`${r.enabled ? "Disable" : "Enable"} crawling ${r.companyName}`}
            onCheckedChange={(next) => void setEnabled(r, next)}
          />
        ),
      },
    ],
    [pendingId, setEnabled],
  );

  const summary = data?.summary;
  const stats: Array<{ label: string; value: number | undefined }> = [
    { label: "Pages", value: summary?.total },
    { label: "Jobs read", value: summary?.ok },
    { label: "No job data", value: summary?.noJobData },
    { label: "Blocked", value: summary?.blocked },
    { label: "Errors", value: summary?.error },
    { label: "Not crawled", value: summary ? summary.total - summary.checked : undefined },
  ];

  return (
    <CollapsibleSection
      title="Careers pages"
      summary={
        summary
          ? `${summary.total} company careers pages (${summary.india} Indian companies, ${summary.indiaOffice} with India offices, ${summary.global} global) — the primary job source; hiring-platform boards are the fallback.`
          : "Companies' own careers pages — the primary job source."
      }
      headerRight={
        <Button
          size="sm"
          variant="outline"
          loading={loading}
          disabled={loading}
          onClick={() => void refresh()}
        >
          Refresh
        </Button>
      }
    >
      <div className="space-y-3">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="text-[12px]">{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat) => (
            <Card
              key={stat.label}
              className="border-border/80 bg-card gap-0 rounded-xl border px-3 py-2 shadow-sm"
            >
              <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
                {stat.label}
              </p>
              {stat.value === undefined ? (
                <Skeleton className="mt-1 h-5 w-10" />
              ) : (
                <p className="text-foreground mt-0.5 font-mono text-lg tabular-nums">
                  {stat.value}
                </p>
              )}
            </Card>
          ))}
        </div>

        {data?.byStrategy.length ? (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Pages by strategy">
            <span className="text-muted-foreground text-[11px]">By strategy:</span>
            {data.byStrategy.map((s) => (
              <Badge key={s.strategy} variant="secondary" className="text-[10px]">
                {s.label} · {s.pages} {s.pages === 1 ? "page" : "pages"} · {s.jobs} jobs
              </Badge>
            ))}
          </div>
        ) : null}

        <DataTable
          columns={columns}
          data={data?.pages ?? []}
          getRowId={(r) => r.id}
          loading={loading && !data}
          searchable
          searchPlaceholder="Search company, URL, strategy or status…"
          pagination={PAGE_SIZES[0]}
          pageSizeOptions={PAGE_SIZES}
          pageSizeLabel="Pages per page"
          emptyMessage="No careers pages yet — the next scan imports the verified list."
        />
      </div>
    </CollapsibleSection>
  );
}
