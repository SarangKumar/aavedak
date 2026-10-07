"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export type ChartSeriesPoint = {
  date: string;
  cumulative: number;
};

export type ChartSeries = {
  userId: string;
  name: string;
  username?: string;
  isMe: boolean;
  color: string;
  points: ChartSeriesPoint[];
};

type DurationKey = "30d" | "all";

type FriendGraphProps = {
  series: ChartSeries[];
  loading?: boolean;
  duration: DurationKey;
  onDurationChange: (value: DurationKey) => void;
  className?: string;
};

const WIDTH = 720;
const HEIGHT = 400;
const PAD = { top: 28, right: 20, bottom: 52, left: 44 };

function dayMs(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function formatTick(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso.slice(5, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function filterSeries(series: ChartSeries[], duration: DurationKey): ChartSeries[] {
  if (duration === "all") return series;
  const cutoff = Date.now() - 30 * 86_400_000;
  return series.map((s) => {
    const inWindow = s.points.filter((p) => dayMs(p.date) >= cutoff);
    if (inWindow.length > 0) return { ...s, points: inWindow };
    // Keep a flat baseline at the last known cumulative before the window
    const before = [...s.points].reverse().find((p) => dayMs(p.date) < cutoff);
    if (!before) return { ...s, points: [] };
    const startIso = new Date(cutoff).toISOString().slice(0, 10);
    return {
      ...s,
      points: [
        { date: startIso, cumulative: before.cumulative },
        { date: new Date().toISOString().slice(0, 10), cumulative: before.cumulative },
      ],
    };
  });
}

function buildPath(
  points: ChartSeriesPoint[],
  xOf: (d: string) => number,
  yOf: (v: number) => number,
): string {
  if (points.length === 0) return "";
  return points
    .map(
      (p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.date).toFixed(1)} ${yOf(p.cumulative).toFixed(1)}`,
    )
    .join(" ");
}

export function FriendGraph({
  series,
  loading = false,
  duration,
  onDurationChange,
  className,
}: FriendGraphProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const visible = useMemo(() => filterSeries(series, duration), [series, duration]);

  const { xTicks, yTicks, xOf, yOf, plotW, plotH } = useMemo(() => {
    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const allDates = visible.flatMap((s) => s.points.map((p) => p.date));
    const allValues = visible.flatMap((s) => s.points.map((p) => p.cumulative));

    const minT =
      allDates.length > 0
        ? Math.min(...allDates.map(dayMs))
        : Date.now() - (duration === "30d" ? 30 : 90) * 86_400_000;
    let maxT = allDates.length > 0 ? Math.max(...allDates.map(dayMs)) : Date.now();
    if (maxT <= minT) maxT = minT + 86_400_000;

    const maxY = Math.max(4, ...(allValues.length ? allValues : [0]));
    const yMax = Math.ceil(maxY / 2) * 2;

    const xOf = (iso: string) => PAD.left + ((dayMs(iso) - minT) / (maxT - minT)) * plotW;
    const yOf = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

    const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((yMax * i) / 4));
    const span = maxT - minT;
    const xTicks = [0, 0.33, 0.66, 1].map((t) =>
      new Date(minT + span * t).toISOString().slice(0, 10),
    );

    return { xTicks, yTicks, xOf, yOf, plotW, plotH, yMax };
  }, [visible, duration]);

  const hovered = visible.find((s) => s.userId === hoveredId) ?? null;
  const lastOf = (s: ChartSeries) => s.points[s.points.length - 1] ?? null;

  return (
    <div
      className={cn(
        "border-border/80 bg-card relative overflow-hidden rounded-xl border shadow-sm",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="text-foreground block h-auto w-full"
        role="img"
        aria-label="Shared application history chart for you and your friends"
      >
        <rect width={WIDTH} height={HEIGHT} className="fill-background/40" />

        {/* Grid */}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={yOf(tick)}
              y2={yOf(tick)}
              className="stroke-border/60"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <text
              x={PAD.left - 8}
              y={yOf(tick) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {tick}
            </text>
          </g>
        ))}
        {xTicks.map((iso) => (
          <text
            key={`x-${iso}`}
            x={xOf(iso)}
            y={HEIGHT - 18}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {formatTick(iso)}
          </text>
        ))}

        {/* Y axis label */}
        <text
          x={14}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${PAD.top + plotH / 2})`}
          className="fill-muted-foreground text-[10px]"
        >
          Applications
        </text>

        {loading ? (
          <text
            x={WIDTH / 2}
            y={HEIGHT / 2}
            textAnchor="middle"
            className="fill-muted-foreground text-[13px]"
          >
            Loading chart…
          </text>
        ) : visible.every((s) => s.points.length === 0) ? (
          <text
            x={WIDTH / 2}
            y={HEIGHT / 2}
            textAnchor="middle"
            className="fill-muted-foreground text-[13px]"
          >
            No application history in this range yet
          </text>
        ) : (
          visible.map((s) => {
            const path = buildPath(s.points, xOf, yOf);
            if (!path) return null;
            const active = !hoveredId || hoveredId === s.userId;
            const last = lastOf(s);
            return (
              <g
                key={s.userId}
                onMouseEnter={() => setHoveredId(s.userId)}
                onMouseLeave={() => setHoveredId(null)}
                className="cursor-pointer"
                opacity={active ? 1 : 0.22}
              >
                <path
                  d={path}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.isMe ? 3 : 2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Invisible wider hit path */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  strokeLinecap="round"
                />
                {last ? (
                  <circle
                    cx={xOf(last.date)}
                    cy={yOf(last.cumulative)}
                    r={s.isMe ? 5 : 4}
                    fill={s.color}
                    stroke="oklch(0.98 0 0)"
                    strokeWidth={1.5}
                  />
                ) : null}
              </g>
            );
          })
        )}
      </svg>

      {/* Legend — top left, hover details */}
      <div className="border-border/70 bg-background/90 absolute left-3 top-3 max-w-[220px] rounded-lg border px-2.5 py-1.5 text-[11px] shadow-sm">
        <p className="text-foreground font-medium">Legend</p>
        <ul className="mt-1 space-y-0.5">
          {visible.map((s) => (
            <li key={s.userId}>
              <button
                type="button"
                className={cn(
                  "text-muted-foreground flex w-full items-center gap-1.5 text-left",
                  hoveredId === s.userId && "text-foreground",
                )}
                onMouseEnter={() => setHoveredId(s.userId)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="truncate">
                  {s.isMe ? `${s.name} (you)` : s.name}
                  {s.username && !s.isMe ? ` · /${s.username}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {hovered ? (
          <p className="text-foreground border-border/60 mt-1.5 border-t pt-1.5">
            {hovered.isMe ? "You" : hovered.name}: {lastOf(hovered)?.cumulative ?? 0} applications
          </p>
        ) : (
          <p className="text-muted-foreground mt-1.5">Hover a line for totals</p>
        )}
      </div>

      {/* Duration interval — bottom right of the chart */}
      <div className="border-border/70 bg-background/90 absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border p-1 text-[11px] shadow-sm">
        <button
          type="button"
          className={cn(
            "rounded-md px-2 py-1",
            duration === "30d"
              ? "bg-primary/15 text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onDurationChange("30d")}
        >
          30 days
        </button>
        <button
          type="button"
          className={cn(
            "rounded-md px-2 py-1",
            duration === "all"
              ? "bg-primary/15 text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onDurationChange("all")}
        >
          All time
        </button>
      </div>
    </div>
  );
}
