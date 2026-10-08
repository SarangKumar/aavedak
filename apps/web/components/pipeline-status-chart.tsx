"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type PipelineStatusPoint = {
  status: string;
  label: string;
  count: number;
};

const BAR_COLORS = [
  "var(--primary)",
  "oklch(0.58 0.14 210)",
  "oklch(0.55 0.18 290)",
  "oklch(0.58 0.16 160)",
  "oklch(0.58 0.17 20)",
  "oklch(0.52 0.14 250)",
] as const;

const chartConfig = {
  count: { label: "Applications", color: "var(--primary)" },
} satisfies ChartConfig;

type Props = {
  data: PipelineStatusPoint[];
};

export function PipelineStatusChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <p className="text-muted-foreground flex h-[180px] items-center justify-center text-[12px]">
        No applications in the pipeline yet.
      </p>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
      <BarChart data={data} accessibilityLayer margin={{ left: 0, right: 4, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval={0}
          tick={{ fontSize: 10 }}
        />
        <YAxis allowDecimals={false} width={24} tickLine={false} axisLine={false} tickMargin={4} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" name="Applications" radius={[6, 6, 0, 0]} maxBarSize={36}>
          {data.map((entry, i) => (
            <Cell key={entry.status} fill={BAR_COLORS[i % BAR_COLORS.length]!} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
