"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RUN_KINDS, RUN_KIND_META } from "@/lib/discovery-crons";

/** `count` = jobs/people discovered that day for this kind (not cron executions). */
type HistoryPoint = { kind: string; day: string; count: number };
type HistoryResponse = {
  /** Window, inclusive India-time dates (YYYY-MM-DD). */
  from?: string;
  to?: string;
  points: HistoryPoint[];
  error?: string;
};

const RANGES = [
  { value: "1w", short: "1W", label: "week", query: "days=7" },
  { value: "1", short: "1M", label: "month", query: "months=1" },
  { value: "3", short: "3M", label: "3 months", query: "months=3" },
  { value: "6", short: "6M", label: "6 months", query: "months=6" },
  { value: "12", short: "12M", label: "12 months", query: "months=12" },
] as const;

/** Every YYYY-MM-DD from `from` to `to` inclusive (date-only arithmetic, no time zone). */
export function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return out;
  for (let t = start; t <= end && out.length < 800; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Today's India-time date, YYYY-MM-DD (fallback window end if the API omits it). */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Full-width line chart of discovery runs per India-time day, one line per kind. The
 * `kind` filter is shared with the Recent runs list: "all" shows every kind. */
export function DiscoveryRunsChart({ kind }: { kind: string }) {
  const [months, setMonths] = useState("3");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HistoryResponse | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = RANGES.find((r) => r.value === m)?.query ?? `months=${m}`;
      const res = await fetch(`/api/admin/discovery/runs/history?${query}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as HistoryResponse;
      if (!res.ok) throw new Error(json.error || "Could not load run history.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load run history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(months);
  }, [months, load]);

  const points = useMemo(() => data?.points ?? [], [data?.points]);

  const activeKinds = useMemo(() => {
    // Every kind gets a line (flat at 0 when nothing was discovered), so the chart never
    // disappears for a quiet range.
    if (kind !== "all") return RUN_KINDS.filter((k) => k === kind);
    return [...RUN_KINDS];
  }, [kind]);

  const chartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    for (const k of activeKinds) {
      cfg[k] = {
        label: RUN_KIND_META[k]?.label ?? k,
        color: RUN_KIND_META[k]?.color ?? "var(--primary)",
      };
    }
    return cfg;
  }, [activeKinds]);

  const chartData = useMemo(() => {
    // Zero-fill: every India-time day in the selected window, including days before the
    // first run (the API only returns days with discoveries).
    const to = data?.to ?? istToday();
    const from = data?.from ?? points[0]?.day ?? to;
    const counts = new Map(points.map((p) => [`${p.day}|${p.kind}`, p.count]));
    return daysInRange(from, to).map((day) => {
      const row: Record<string, string | number> = { date: day, label: day.slice(5) };
      for (const k of activeKinds) row[k] = counts.get(`${day}|${k}`) ?? 0;
      return row;
    });
  }, [points, activeKinds, data?.from, data?.to]);

  const tickInterval = Math.max(0, Math.ceil(chartData.length / 6) - 1);
  const totalDiscovered = points
    .filter((p) => kind === "all" || p.kind === kind)
    .reduce((sum, p) => sum + p.count, 0);
  const rangeLabel = RANGES.find((r) => r.value === months)?.label ?? `${months} months`;
  const noun = kind === "jobs_scan" ? "jobs" : kind === "all" ? "jobs & people" : "people";

  const body =
    loading && !data ? (
      <Skeleton className="h-[220px] w-full rounded-md sm:h-[260px]" />
    ) : chartData.length === 0 ? (
      <p className="text-muted-foreground flex h-[220px] items-center justify-center text-[12px]">
        Nothing discovered in this range yet.
      </p>
    ) : (
      <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full sm:h-[260px]">
        <LineChart
          data={chartData}
          accessibilityLayer
          margin={{ left: 4, right: 8, top: 8, bottom: 28 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            interval={tickInterval}
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            width={28}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { date?: string } | undefined;
                  return row?.date ?? "";
                }}
              />
            }
          />
          <Legend
            verticalAlign="bottom"
            align="left"
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          {activeKinds.map((k) => {
            const color = RUN_KIND_META[k]?.color ?? "var(--primary)";
            return (
              <Line
                key={k}
                dataKey={k}
                name={RUN_KIND_META[k]?.label ?? k}
                type="monotone"
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: "var(--color-foreground)", stroke: color, strokeWidth: 2 }}
              />
            );
          })}
        </LineChart>
      </ChartContainer>
    );

  return (
    <Card className="gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-[13px] tracking-tight">Discovered over time</CardTitle>
          <CardDescription className="text-[11px] leading-relaxed">
            {loading && !data
              ? "Loading…"
              : `${totalDiscovered} ${noun} discovered in the last ${rangeLabel} · by India-time day`}
          </CardDescription>
        </div>
        <ToggleGroup
          aria-label="Chart time range"
          variant="outline"
          size="sm"
          value={[months]}
          onValueChange={(next) => {
            const range = RANGES.find((r) => r.value === next[0]);
            if (range) setMonths(range.value);
          }}
          className="shrink-0 self-start"
        >
          {RANGES.map((r) => (
            <ToggleGroupItem key={r.value} value={r.value} className="h-7 px-2.5 text-[11px]">
              {r.short}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="min-w-0">{body}</div>
    </Card>
  );
}
