import { cn } from "@/lib/utils";

/**
 * Circular score gauge (0–100). The number is always shown, so the arc color is a
 * redundant magnitude cue, not the sole signal. Color ramps low→high as orange→green.
 */
export function ScoreRing({
  value,
  size = 44,
  strokeWidth,
  className,
}: {
  value: number;
  /** Outer diameter in px. Default 44 fits the results-table column. */
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const sw = strokeWidth ?? Math.max(3, Math.round(size * 0.1));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  // Magnitude ramp: 0 → orange-red, 100 → green. Gamma keeps mid-scores (≈55) orange.
  const hue = 120 * Math.pow(v / 100, 1.6);
  const arc = `hsl(${hue.toFixed(0)} 82% 46%)`;

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={sw}
          className="text-border/70 stroke-current"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
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
        style={{ fontSize: Math.round(size * 0.32) }}
      >
        {v}
      </span>
    </span>
  );
}
