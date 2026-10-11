"use client";

import React, { useEffect, useRef, useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FuseButtonProps = Omit<ButtonProps, "onClick"> & {
  /**
   * Whether the fuse is lit. Controlled by the parent: the parent validates in `onActivate`
   * and sets this to true; the fuse then burns down, calling `onFire` when it reaches zero.
   */
  active: boolean;
  /** Pressed while idle. The parent decides whether to light the fuse. */
  onActivate: () => void;
  /** The fuse burned out without an undo. The parent should set `active` back to false. */
  onFire: () => void;
  /** Pressed while lit. The parent should set `active` back to false without firing. */
  onUndo: () => void;
  /** Length of the fuse in ms. */
  duration?: number;
  /**
   * Label shown while lit, followed by the seconds left. Icon sizes (`icon`, `icon-sm`,
   * `icon-lg`) have no room for words, so they show only the seconds and this becomes the
   * accessible name.
   */
  undoLabel?: string;
  /**
   * `rect` (default) traces the button's own corner radius. `circle` makes the button round
   * and burns along a true circle; use it for round icon buttons (e.g. the Outreach send).
   */
  shape?: "rect" | "circle";
};

const STROKE_INSET = 0.75;
/** Used when the button's corner radius can't be read. Matches `rounded-md`. */
const FALLBACK_RADIUS = 6;

/** The border as a path that starts at the top middle and runs clockwise. */
function fuseOutline(width: number, height: number, radius: number): string {
  const x0 = STROKE_INSET;
  const y0 = STROKE_INSET;
  const x1 = width - STROKE_INSET;
  const y1 = height - STROKE_INSET;
  const r = radius;
  const cx = width / 2;
  return [
    `M${cx} ${y0}`,
    `H${x1 - r}`,
    `A${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
    `V${y1 - r}`,
    `A${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
    `H${x0 + r}`,
    `A${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
    `V${y0 + r}`,
    `A${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    `H${cx}`,
  ].join(" ");
}

/** A circle centred in the box, starting at the top middle and running clockwise. */
function fuseCircle(width: number, height: number): string {
  const r = Math.min(width, height) / 2 - STROKE_INSET;
  const cx = width / 2;
  const cy = height / 2;
  return `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx} ${cy + r} A${r} ${r} 0 1 1 ${cx} ${cy - r}`;
}

/** The button's own corner radius, clamped so a pill (`rounded-full`) gets a true circle. */
function cornerRadius(element: Element, width: number, height: number): number {
  const declared = parseFloat(getComputedStyle(element).borderTopLeftRadius);
  const radius = Number.isFinite(declared) ? declared : FALLBACK_RADIUS;
  return Math.max(0, Math.min(radius, width / 2 - STROKE_INSET, height / 2 - STROKE_INSET));
}

/**
 * An action button whose lit state is an undo on a burning fuse. The fire starts at the top
 * middle of the border and burns one way, clockwise, all the way round back to the top middle.
 * No toast: the button itself carries the countdown.
 *
 * Takes every Button size, including the icon sizes (`icon`, `icon-sm`, `icon-lg`).
 */
export function FuseButton({
  active,
  onActivate,
  onFire,
  onUndo,
  duration = 5000,
  undoLabel = "Undo",
  shape = "rect",
  variant,
  size,
  className,
  disabled,
  children,
  ...props
}: FuseButtonProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(duration / 1000));
  const isIcon = typeof size === "string" && size.startsWith("icon");

  // Read the latest `onFire` from the animation frame without restarting the fuse each render.
  const onFireRef = useRef(onFire);
  useEffect(() => {
    onFireRef.current = onFire;
  });

  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const path = pathRef.current;
      const svg = path?.ownerSVGElement;
      // Each lit cycle mounts a fresh path, so measure the button once per cycle.
      if (path && svg && !path.getAttribute("d")) {
        const host = svg.parentElement;
        const width = svg.clientWidth;
        const height = svg.clientHeight;
        if (shape === "circle") {
          path.setAttribute("d", fuseCircle(width, height));
        } else {
          const radius = host ? cornerRadius(host, width, height) : FALLBACK_RADIUS;
          path.setAttribute("d", fuseOutline(width, height, radius));
        }
      }
      const left = Math.max(0, duration - (now - start));
      // pathLength is 1 and starts at the top middle. The burnt part grows clockwise from 0, so
      // the dash that is left is the last `share` of the path, ending back at the top middle.
      const share = left / duration;
      path?.style.setProperty("stroke-dasharray", `${share} 2`);
      path?.style.setProperty("stroke-dashoffset", `${share - 1}`);
      const seconds = Math.ceil(left / 1000);
      setSecondsLeft((current) => (current === seconds ? current : seconds));
      if (left <= 0) {
        onFireRef.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, duration, shape]);

  // Undo stays clickable even if the surrounding form changes while the fuse burns.
  return (
    <Button
      {...props}
      size={size}
      variant={active ? "outline" : variant}
      disabled={active ? false : disabled}
      onClick={() => (active ? onUndo() : onActivate())}
      className={cn(
        shape === "circle" && "aspect-square rounded-full",
        active && "tabular-nums",
        className,
      )}
      aria-label={active && isIcon ? undoLabel : props["aria-label"]}
    >
      {active ? (
        isIcon ? (
          <span className="text-xs">{secondsLeft}</span>
        ) : (
          `${undoLabel} · ${secondsLeft}s`
        )
      ) : (
        children
      )}
      {active ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <path
            ref={pathRef}
            pathLength={1}
            fill="none"
            strokeWidth={1.5}
            style={{
              stroke: "var(--primary)",
              filter: "drop-shadow(0 0 3px var(--primary))",
            }}
          />
        </svg>
      ) : null}
    </Button>
  );
}
