"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

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

const ROW_HEIGHT = 26;

type Props = {
  data: PipelineStatusPoint[];
};

/**
 * Horizontal bars: status labels stay readable at phone width, where a vertical bar chart
 * would have to squeeze ten labels under the x-axis.
 */
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
    <ChartContainer
      config={chartConfig}
      className="aspect-auto w-full"
      style={{ height: data.length * ROW_HEIGHT + 8 }}
    >
      <BarChart
        data={data}
        layout="vertical"
        accessibilityLayer
        barCategoryGap={4}
        margin={{ left: 0, right: 28, top: 4, bottom: 4 }}
      >
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={92}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval={0}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
        <Bar dataKey="count" name="Applications" fill="var(--color-count)" radius={4}>
          <LabelList
            dataKey="count"
            position="right"
            offset={6}
            className="fill-muted-foreground tabular-nums"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
