import { cn } from "@/lib/utils";

/**
 * Circular score gauge (0–100). The number is always shown, so the arc color is a
 * redundant magnitude cue, not the sole signal. Color ramps low→high as orange→green.
 */
/** Outer diameter in px per named size. `xs` fits the dense table cells (32px). */
const SIZE_PX = { xs: 32, default: 44 } as const;

export function ScoreRing({
  value,
  size = "default",
  strokeWidth,
  className,
}: {
  value: number;
  /** Named size, or a custom outer diameter in px. Default 44 fits the results-table column. */
  size?: keyof typeof SIZE_PX | number;
  strokeWidth?: number;
  className?: string;
}) {
  const px = typeof size === "number" ? size : SIZE_PX[size];
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const sw = strokeWidth ?? Math.max(3, Math.round(px * 0.1));
  const r = (px - sw) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  // Magnitude ramp: 0 → orange-red, 100 → green. Gamma keeps mid-scores (≈55) orange.
  const hue = 120 * Math.pow(v / 100, 1.6);
  const arc = `hsl(${hue.toFixed(0)} 82% 46%)`;

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: px, height: px }}
    >
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="-rotate-90">
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          strokeWidth={sw}
          className="text-border/70 stroke-current"
        />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke={arc}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <span
        className="text-foreground absolute font-mono font-semibold tabular-nums"
        style={{ fontSize: Math.round(px * 0.32) }}
      >
        {v}
      </span>
    </span>
  );
}
