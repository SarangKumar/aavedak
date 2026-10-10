"use client";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";

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

const chartConfig = {
  count: { label: "Applications", color: "var(--primary)" },
} satisfies ChartConfig;

type Props = {
  data: PipelineStatusPoint[];
};

/**
 * Radar of applications per status: each spoke is one status, so the shape shows where the
 * pipeline is heavy or empty at a glance. Labels wrap to the chart width, so it works on phones.
 */
export function PipelineStatusChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <p className="text-muted-foreground flex h-[170px] items-center justify-center text-[12px]">
        No applications in the pipeline yet.
      </p>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square w-full max-w-[170px]">
      <RadarChart data={data} outerRadius="72%">
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
        <PolarGrid className="stroke-border/70" />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 10 }} />
        <Radar
          name="Applications"
          dataKey="count"
          stroke="var(--color-count)"
          fill="var(--color-count)"
          fillOpacity={0.25}
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-count)" }}
        />
      </RadarChart>
    </ChartContainer>
  );
}
