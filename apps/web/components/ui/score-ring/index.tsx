import React from "react";

import { cn } from "@/lib/utils";

export type ScoreRingSize = "xs" | "sm" | "default" | "lg";

// Pixel diameter and stroke width per size. The ring is drawn in a 100-unit
// viewBox, so `stroke` is a share of the diameter, not px.
const sizes: Record<ScoreRingSize, { box: string; stroke: number; text: string }> = {
  xs: { box: "size-8", stroke: 12, text: "text-[10px]" },
  sm: { box: "size-12", stroke: 10, text: "text-xs" },
  default: { box: "size-16", stroke: 9, text: "text-base" },
  lg: { box: "size-24", stroke: 8, text: "text-2xl" },
};

export type ScoreRingProps = Omit<React.ComponentProps<"div">, "children" | "role"> & {
  /** Score from 0 to `max`. Values outside the range are clamped. */
  value: number;
  /** Score that fills the whole ring. Defaults to 100. */
  max?: number;
  size?: ScoreRingSize;
  /** Show the score in the middle of the ring. Defaults to true. */
  showValue?: boolean;
  /** Replaces the default score text in the middle of the ring. */
  children?: React.ReactNode;
  /** Accessible name, e.g. "Performance score". */
  label?: string;
};

// Forest green (#228B22) is hsl(120 60.7% 34.1%). The stroke keeps that
// saturation and lightness and moves the hue from 0 (red) to 120 (green), so a
// full score is exactly #228B22 and the scale passes through amber and yellow.
const RING_SATURATION = 60.7;
const RING_LIGHTNESS = 34.1;

/** Stroke color for a 0–1 score ratio: red at 0, forest green (#228B22) at 1. */
export function scoreRingColor(ratio: number) {
  const hue = Math.round(clamp(ratio, 0, 1) * 1200) / 10;
  return `hsl(${hue} ${RING_SATURATION}% ${RING_LIGHTNESS}%)`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * A circular score meter. The stroke hue moves smoothly from red at 0 through
 * amber and yellow to forest green (#228B22) at the max (see `scoreRingColor`).
 * The number in the middle is always the foreground color. Pass `label` so the
 * meter has an accessible name.
 */
export function ScoreRing({
  value,
  max = 100,
  size = "default",
  showValue = true,
  label,
  children,
  className,
  style,
  ref,
  ...props
}: ScoreRingProps) {
  const safeMax = max > 0 ? max : 100;
  const score = clamp(Number.isFinite(value) ? value : 0, 0, safeMax);
  const ratio = score / safeMax;
  const { box, stroke, text } = sizes[size];
  const radius = 50 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const color = scoreRingColor(ratio);

  return (
    <div
      {...props}
      ref={ref}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={score}
      data-slot="score-ring"
      data-size={size}
      style={style}
      className={cn("relative inline-flex shrink-0 items-center justify-center", box, className)}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-full -rotate-90" fill="none">
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted"
        />
        <circle
          data-slot="score-ring-indicator"
          cx="50"
          cy="50"
          r={radius}
          // Inline style (not the stroke attribute) so var() colors resolve.
          style={{ stroke: color }}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      {children !== undefined || showValue ? (
        <span
          className={cn(
            "text-foreground absolute inset-0 flex items-center justify-center font-semibold tabular-nums leading-none",
            text,
          )}
        >
          {children ?? Math.round(score)}
        </span>
      ) : null}
    </div>
  );
}
