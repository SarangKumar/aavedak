"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ActivityDay = { date: string; count: number };

type FriendMeta = {
  userId: string;
  username: string;
  name: string | null;
};

type ActivityResponse = {
  months: number;
  mine: ActivityDay[];
  friends: FriendMeta[];
  friend: (FriendMeta & { days: ActivityDay[] }) | null;
  error?: string;
};

const RANGES = [
  { value: "1", label: "1 month" },
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
] as const;

function ActivityLineChart({
  days,
  seriesKey,
  label,
  colorToken,
}: {
  days: ActivityDay[];
  seriesKey: string;
  label: string;
  colorToken: string;
}) {
  const config = useMemo(
    () =>
      ({
        [seriesKey]: {
          label,
          color: colorToken,
        },
      }) satisfies ChartConfig,
    [seriesKey, label, colorToken],
  );

  const data = useMemo(
    () =>
      days.map((d) => ({
        date: d.date,
        label: d.date.slice(5),
        [seriesKey]: d.count,
      })),
    [days, seriesKey],
  );

  const total = days.reduce((s, d) => s + d.count, 0);
  const peak = Math.max(0, ...days.map((d) => d.count));

  // Sparse X ticks for long ranges
  const tickInterval = Math.max(0, Math.ceil(data.length / 6) - 1);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-foreground text-[13px] font-semibold tracking-tight">{label}</p>
        <p className="text-muted-foreground text-[11px] tabular-nums">
          {total} total · peak {peak}/day
        </p>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[200px] w-full">
        <LineChart data={data} accessibilityLayer margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
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
          <Line
            dataKey={seriesKey}
            type="monotone"
            stroke={`var(--color-${seriesKey})`}
            strokeWidth={2}
            dot={{
              r: 3,
              fill: "var(--color-foreground)",
              stroke: `var(--color-${seriesKey})`,
              strokeWidth: 2,
            }}
            activeDot={{
              r: 5,
              fill: "var(--color-foreground)",
              stroke: `var(--color-${seriesKey})`,
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

export function ApplicationsActivityCharts() {
  const [months, setMonths] = useState("3");
  const [friendId, setFriendId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ActivityResponse | null>(null);

  const load = useCallback(async (m: string, fId: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ months: m });
      if (fId) qs.set("friendId", fId);
      const res = await fetch(`/api/dashboard/activity?${qs.toString()}`);
      const json = (await res.json()) as ActivityResponse;
      if (!res.ok) throw new Error(json.error || "Could not load activity.");
      setData(json);
      if (!fId && json.friend?.userId) {
        setFriendId(json.friend.userId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(months, friendId);
  }, [months, friendId, load]);

  const friends = data?.friends ?? [];
  const hasFriendSlot = friends.length > 0;

  return (
    <section aria-labelledby="activity-heading" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="activity-heading"
            className="text-foreground text-[13px] font-semibold tracking-tight"
          >
            Applications per day
          </h2>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Live counts from your tracker (deleting an application removes that day&apos;s
            contribution). Compete with friends once they accept your invite.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="border-border bg-card text-foreground h-8 w-[8.5rem] rounded-lg border px-2.5 text-[12px]">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent className="z-[280]">
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {friends.length > 0 ? (
            <Select value={friendId || friends[0]!.userId} onValueChange={setFriendId}>
              <SelectTrigger className="border-border bg-card text-foreground h-8 min-w-[9rem] rounded-lg border px-2.5 text-[12px]">
                <SelectValue placeholder="Friend" />
              </SelectTrigger>
              <SelectContent className="z-[280]">
                {friends.map((f) => (
                  <SelectItem key={f.userId} value={f.userId}>
                    {f.name?.trim() || `@${f.username}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-destructive text-[12px]">{error}</p> : null}

      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          hasFriendSlot || !data ? "lg:grid-cols-2" : "lg:grid-cols-1",
        )}
      >
        <div className="border-border/80 bg-card rounded-lg border p-4 shadow-sm">
          {loading && !data ? (
            <div className="text-muted-foreground flex h-[220px] items-center justify-center gap-2 text-[12px]">
              <Spinner /> Loading chart…
            </div>
          ) : (
            <ActivityLineChart
              days={data?.mine ?? []}
              seriesKey="you"
              label="You"
              colorToken="var(--color-chart-1)"
            />
          )}
        </div>

        {hasFriendSlot ? (
          <div className="border-border/80 bg-card rounded-lg border p-4 shadow-sm">
            {loading && !data?.friend ? (
              <div className="text-muted-foreground flex h-[220px] items-center justify-center gap-2 text-[12px]">
                <Spinner /> Loading friend…
              </div>
            ) : data?.friend ? (
              <ActivityLineChart
                days={data.friend.days}
                seriesKey="friend"
                label={data.friend.name?.trim() || `@${data.friend.username}`}
                colorToken="var(--color-chart-2)"
              />
            ) : (
              <p className="text-muted-foreground text-[12px]">No friend data yet.</p>
            )}
          </div>
        ) : (
          <div className="border-border/80 bg-card flex flex-col justify-center rounded-lg border border-dashed p-4 shadow-sm">
            <p className="text-foreground text-[13px] font-semibold tracking-tight">
              Friendly competition
            </p>
            <p className="text-muted-foreground mt-1 text-[12px] leading-relaxed">
              Copy your invite link from Profile → Friends. When someone accepts, their
              applications/day graph appears here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
