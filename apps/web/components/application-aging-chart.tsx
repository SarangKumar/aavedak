"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type AgingBucketPoint = { label: string; count: number };

const chartConfig = {
  count: { label: "Applications", color: "var(--primary)" },
} satisfies ChartConfig;

/** Horizontal bars: waiting applications per age bucket (buckets on the y-axis). */
export function ApplicationAgingChart({ data }: { data: AgingBucketPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[132px] w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
        <XAxis type="number" dataKey="count" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={48}
          tick={{ fontSize: 10 }}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
        <Bar dataKey="count" name="Applications" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
