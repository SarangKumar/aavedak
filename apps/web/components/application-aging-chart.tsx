"use client";

import { Bar, BarChart, Cell, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type AgingBucketPoint = { label: string; count: number; overdue: boolean };

const chartConfig = {
  count: { label: "Applications", color: "var(--primary)" },
} satisfies ChartConfig;

/** Waiting applications per age bucket; buckets past the follow-up point are tinted. */
export function ApplicationAgingChart({ data }: { data: AgingBucketPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[120px] w-full">
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
        <Bar dataKey="count" name="Applications" radius={4}>
          {data.map((d) => (
            <Cell
              key={d.label}
              fill={d.overdue ? "var(--color-count)" : "var(--muted-foreground)"}
              fillOpacity={d.overdue ? 0.85 : 0.35}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
