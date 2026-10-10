"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ActivityDay = { date: string; count: number };

type SeriesDto = {
  userId: string;
  username: string;
  name: string | null;
  isMe: boolean;
  days: ActivityDay[];
};

type ActivityResponse = {
  months: number;
  series: SeriesDto[];
  error?: string;
};

const RANGES = [
  { value: "1", label: "month", short: "1M" },
  { value: "3", label: "3 months", short: "3M" },
  { value: "6", label: "6 months", short: "6M" },
  { value: "12", label: "12 months", short: "12M" },
] as const;

/** Friend lines only — the current user always uses CSS `--primary` (brand yellow). */
const FRIEND_COLORS = [
  "oklch(0.58 0.14 210)", // teal-blue
  "oklch(0.55 0.18 290)", // violet
  "oklch(0.58 0.16 160)", // green
  "oklch(0.58 0.17 20)", // coral
  "oklch(0.52 0.14 250)", // indigo
  "oklch(0.56 0.15 340)", // magenta
  "oklch(0.50 0.12 200)", // cyan
  "oklch(0.54 0.14 145)", // emerald
  "oklch(0.52 0.16 310)", // purple
  "oklch(0.56 0.13 30)", // terracotta
  "oklch(0.48 0.11 230)", // slate-blue
] as const;

const YOU_COLOR = "var(--primary)";

function strokeForSeries(s: SeriesDto, friendIndex: number): string {
  if (s.isMe) return YOU_COLOR;
  return FRIEND_COLORS[friendIndex % FRIEND_COLORS.length]!;
}

function seriesLabel(s: SeriesDto): string {
  if (s.isMe) return "You";
  return s.name?.trim() || `@${s.username}`;
}

function seriesKey(s: SeriesDto): string {
  return s.isMe ? "you" : `f_${s.userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;
}

export function ApplicationsActivityCharts() {
  const [months, setMonths] = useState("1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ActivityResponse | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ months: m });
      const res = await fetch(`/api/dashboard/activity?${qs.toString()}`);
      const json = (await res.json()) as ActivityResponse;
      if (!res.ok) throw new Error(json.error || "Could not load activity.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(months);
  }, [months, load]);

  const series = useMemo(() => data?.series ?? [], [data?.series]);
  const hasFriends = series.some((s) => !s.isMe);

  const chartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    let friendIndex = 0;
    for (const s of series) {
      const key = seriesKey(s);
      const color = strokeForSeries(s, friendIndex);
      if (!s.isMe) friendIndex += 1;
      cfg[key] = {
        label: seriesLabel(s),
        color,
      };
    }
    return cfg;
  }, [series]);

  const chartData = useMemo(() => {
    const dates = new Set<string>();
    for (const s of series) {
      for (const d of s.days) dates.add(d.date);
    }
    const sorted = [...dates].sort();
    return sorted.map((date) => {
      const row: Record<string, string | number> = {
        date,
        label: date.slice(5),
      };
      for (const s of series) {
        const key = seriesKey(s);
        row[key] = s.days.find((d) => d.date === date)?.count ?? 0;
      }
      return row;
    });
  }, [series]);

  const tickInterval = Math.max(0, Math.ceil(chartData.length / 6) - 1);
  const rangeLabel = RANGES.find((r) => r.value === months)?.label ?? `${months} months`;

  const totalMine = series.find((s) => s.isMe)?.days.reduce((sum, d) => sum + d.count, 0) ?? 0;

  const chartBody =
    loading && !data ? (
      <Skeleton className="h-[220px] w-full rounded-md sm:h-[280px]" />
    ) : chartData.length === 0 ? (
      <p className="text-muted-foreground flex h-[220px] items-center justify-center text-[12px]">
        No application activity in this range yet.
      </p>
    ) : (
      <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full sm:h-[280px]">
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
          {series.map((s, i) => {
            const key = seriesKey(s);
            const friendIndex = series.slice(0, i).filter((x) => !x.isMe).length;
            const stroke = strokeForSeries(s, friendIndex);
            return (
              <Line
                key={s.userId}
                dataKey={key}
                name={seriesLabel(s)}
                type="monotone"
                stroke={stroke}
                strokeWidth={s.isMe ? 2.5 : 2}
                dot={{
                  r: s.isMe ? 3.5 : 2.5,
                  fill: "var(--color-foreground)",
                  stroke,
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 5,
                  fill: "var(--color-foreground)",
                  stroke,
                  strokeWidth: 2,
                }}
              />
            );
          })}
        </LineChart>
      </ChartContainer>
    );

  return (
    <Tabs value={months} onValueChange={setMonths} className="h-full gap-0">
      <Card role="region" className="h-full gap-3" aria-labelledby="activity-heading">
        {/* Flex, not CardHeader's two-column grid: on phones the range switch drops below the
            title instead of squeezing it into a narrow column. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-1">
            <CardTitle id="activity-heading" className="text-[13px] tracking-tight">
              Applications per day
            </CardTitle>
            <CardDescription className="text-[11px] leading-relaxed">
              {loading && !data ? (
                "Loading…"
              ) : (
                <>
                  <span className="whitespace-nowrap">
                    {totalMine} logged in the last {rangeLabel}
                  </span>
                  {hasFriends ? (
                    <>
                      <span aria-hidden> · </span>
                      <span className="whitespace-nowrap">friends shown as extra lines</span>
                    </>
                  ) : null}
                </>
              )}
            </CardDescription>
          </div>
          <TabsList aria-label="Chart time range" className="h-8 shrink-0 self-start">
            {RANGES.map((r) => (
              <TabsTrigger key={r.value} value={r.value} className="px-2.5 text-[11px]">
                {r.short}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <TabsContent value={months} className="min-w-0">
          {chartBody}
        </TabsContent>

        {!hasFriends && !loading ? (
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Invite a friend from Profile → Friends to compare lines on this chart.
          </p>
        ) : null}
      </Card>
    </Tabs>
  );
}
