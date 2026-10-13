"use client";

import createGlobe, { type COBEOptions, type Marker } from "cobe";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { jobsSearchHref, type GlobeCity } from "@/lib/job-map/locations";
import { cn } from "@/lib/utils";

type Rgb = [number, number, number];

// cobe takes 0–1 RGB, not CSS variables, so these mirror the theme tokens in globals.css:
// warm-grey land dots, the brand gold (--primary) for openings, and a rim "glow" in the
// page background color so the edge blends in (a thin ring outlines it instead).
const PALETTES: Record<
  "dark" | "light",
  Pick<COBEOptions, "dark" | "diffuse" | "mapBrightness"> & {
    baseColor: Rgb;
    markerColor: Rgb;
    glowColor: Rgb;
  }
> = {
  dark: {
    dark: 1,
    diffuse: 1.2,
    mapBrightness: 5,
    baseColor: [0.34, 0.32, 0.29],
    markerColor: [0.98, 0.78, 0.16],
    glowColor: [0.04, 0.04, 0.035],
  },
  light: {
    dark: 0,
    diffuse: 1.3,
    mapBrightness: 7,
    baseColor: [1, 1, 1],
    markerColor: [0.86, 0.58, 0.04],
    glowColor: [1, 1, 1],
  },
};

// Face India (~79°E, tilted to ~17°N). cobe's phi for a longitude: π − (lng·π/180 − π/2).
const FOCUS_LNG = 79;
const FOCUS_PHI = Math.PI - ((FOCUS_LNG * Math.PI) / 180 - Math.PI / 2);
const THETA = 0.36;
// Slightly zoomed so India reads well while the whole sphere and its glowing rim stay in
// frame, as on cobe.vercel.app (cobe's sphere spans 80% of the canvas at scale 1).
const SCALE = 1.15;
// Openings are worldwide: start facing India, then turn slowly all the way round (drag to
// spin it by hand). Reduced motion keeps it still on India.
const ROTATE_SPEED = 0.0015;

const CULL_EVERY_FRAMES = 12;

/**
 * Hide labels that overlap a bigger city's label on screen. Labels are in DOM order of
 * city size, so the first one to claim a spot keeps it. Labels on the far side of the globe
 * (no --cobe-visible-<id>) don't claim space.
 */
function cullOverlappingLabels(container: HTMLElement): void {
  const rootStyle = getComputedStyle(document.documentElement);
  const taken: DOMRect[] = [];
  for (const el of container.querySelectorAll<HTMLElement>("[data-globe-label]")) {
    const facing = rootStyle.getPropertyValue(`--cobe-visible-${el.dataset.globeLabel}`) !== "";
    const rect = el.getBoundingClientRect();
    const overlaps = taken.some(
      (r) =>
        rect.left < r.right + 4 &&
        rect.right > r.left - 4 &&
        rect.top < r.bottom + 2 &&
        rect.bottom > r.top - 2,
    );
    const show = facing && !overlaps;
    el.toggleAttribute("data-culled", !show);
    // Hidden labels (behind the globe or overlapped) leave the tab order.
    el.tabIndex = show ? 0 : -1;
    if (show) taken.push(rect);
  }
  // Dot hover targets: only on the facing side, and not where the city's label is showing.
  for (const el of container.querySelectorAll<HTMLElement>("[data-globe-dot]")) {
    const id = el.dataset.globeDot;
    const facing = rootStyle.getPropertyValue(`--cobe-visible-${id}`) !== "";
    const label = container.querySelector(`[data-globe-label="${id}"]`);
    const labelShown = label !== null && !label.hasAttribute("data-culled");
    el.toggleAttribute("data-hidden", !facing || labelShown);
  }
}

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains("dark");
}

/**
 * Dot size follows the city's open roles (not companies): sqrt-scaled against the busiest city,
 * so area tracks openings, from 0.01 for the smallest to 0.02 for the busiest.
 */
function markerSize(openings: number, maxOpenings: number): number {
  return 0.01 + 0.01 * Math.sqrt(openings / Math.max(1, maxOpenings));
}

export function OpeningsGlobe({
  cities,
  activeId = null,
  onActiveChange,
  className,
}: {
  cities: GlobeCity[];
  /** City whose label is highlighted (e.g. the one shown in a details panel). */
  activeId?: string | null;
  /** Called when a label is hovered or focused. */
  onActiveChange?: (id: string) => void;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  const markers = useMemo<Marker[]>(() => {
    const max = cities[0]?.count ?? 1;
    return cities.map((c) => ({
      id: c.id,
      location: [c.lat, c.lng],
      size: markerSize(c.count, max),
    }));
  }, [cities]);

  useEffect(() => {
    const root = rootRef.current;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!root || !host || !canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let size = host.offsetWidth || 400;
    let t = 0;
    let dragPhi = 0;
    let dragStartX: number | null = null;
    let dragStartPhi = 0;
    let visible = true;
    let raf = 0;
    let frameCount = 0;

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size,
      height: size,
      phi: FOCUS_PHI,
      theta: THETA,
      scale: SCALE,
      // A little denser than cobe's default so India's outline reads at this zoom.
      mapSamples: 24000,
      markerElevation: 0.01,
      markers,
      ...PALETTES[isDarkTheme() ? "dark" : "light"],
    });

    const frame = () => {
      if (!reducedMotion && dragStartX === null) t += ROTATE_SPEED;
      globe.update({ phi: FOCUS_PHI + t + dragPhi });
      if (frameCount++ % CULL_EVERY_FRAMES === 0) cullOverlappingLabels(root);
      raf = visible ? requestAnimationFrame(frame) : 0;
    };
    raf = requestAnimationFrame(frame);
    // Let the first frame paint before fading in, so the canvas never flashes empty.
    const readyTimer = window.setTimeout(() => setReady(true), 60);

    // Pause the render loop while the globe is scrolled out of view.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(host);

    const ro = new ResizeObserver(() => {
      const next = host.offsetWidth;
      if (next && next !== size) {
        size = next;
        globe.update({ width: size, height: size });
      }
    });
    ro.observe(host);

    // Follow the site theme toggle (it flips the .dark class on <html>).
    const mo = new MutationObserver(() => globe.update(PALETTES[isDarkTheme() ? "dark" : "light"]));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const onDown = (e: PointerEvent) => {
      dragStartX = e.clientX;
      dragStartPhi = dragPhi;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (dragStartX === null) return;
      dragPhi = dragStartPhi + (e.clientX - dragStartX) / 160;
    };
    const onUp = () => {
      dragStartX = null;
      canvas.style.cursor = "";
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(readyTimer);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      globe.destroy();
      // cobe v2 wraps the canvas in its own div (which also holds the marker anchors).
      // Put the canvas back so a re-run (Strict Mode, new markers) doesn't nest wrappers.
      const wrapper = canvas.parentElement;
      if (wrapper && wrapper !== host) {
        host.appendChild(canvas);
        wrapper.remove();
      }
    };
  }, [markers]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative aspect-square w-full transition-opacity duration-1000 ease-out",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {/* Hairline edge in the foreground color. cobe's sphere spans 80% × SCALE of the
          canvas, so the ring is inset by the rest. */}
      <div
        aria-hidden
        className="border-foreground/12 pointer-events-none absolute rounded-full border"
        style={{ inset: `${((1 - 0.8 * SCALE) / 2) * 100}%` }}
      />
      <div ref={hostRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          aria-hidden
          className="size-full cursor-grab touch-pan-y [contain:layout_paint_size]"
        />
      </div>
      {cities.map((city) => (
        // Hover target over the canvas dot: shows the same name + count pill as a label.
        // Out of the tab order; the city stays reachable through Jobs search.
        <Link
          key={`dot-${city.id}`}
          href={jobsSearchHref(city.name)}
          tabIndex={-1}
          aria-label={`${city.name}: ${city.count} open ${city.count === 1 ? "role" : "roles"}`}
          onMouseEnter={() => onActiveChange?.(city.id)}
          data-globe-dot={city.id}
          data-hidden=""
          className="aavedak-globe-dot"
          style={{ "--globe-anchor": `--cobe-${city.id}` } as CSSProperties}
        >
          <span className="aavedak-globe-dot-tip" aria-hidden>
            {city.name}
            <span className="text-primary tabular-nums">{city.count}</span>
          </span>
        </Link>
      ))}
      {cities.map((city) =>
        city.label ? (
          // Opens Jobs searched by this city. Starts out of the tab order; the cull pass
          // makes it focusable while the label is actually shown.
          <Link
            key={city.id}
            href={jobsSearchHref(city.name)}
            tabIndex={-1}
            aria-label={`${city.name}: ${city.count} open ${city.count === 1 ? "role" : "roles"}`}
            onMouseEnter={() => onActiveChange?.(city.id)}
            onFocus={() => onActiveChange?.(city.id)}
            data-globe-label={city.id}
            data-active={city.id === activeId || undefined}
            data-culled=""
            data-side={city.label}
            className="aavedak-globe-label"
            style={
              {
                "--globe-anchor": `--cobe-${city.id}`,
                // cobe sets --cobe-visible-<id> while the marker faces the viewer.
                opacity: `var(--cobe-visible-${city.id}, 0)`,
              } as CSSProperties
            }
          >
            {city.name}
            <span className="text-primary tabular-nums">{city.count}</span>
            {/* Quick look on hover / focus; the label stays the link to the city's jobs. */}
            <span className="aavedak-globe-card" aria-hidden>
              <span className="text-foreground block text-[11px] font-semibold">{city.name}</span>
              <span className="text-muted-foreground block text-[10px]">
                {city.count} open {city.count === 1 ? "role" : "roles"} · {city.companyCount}{" "}
                {city.companyCount === 1 ? "company" : "companies"}
              </span>
            </span>
          </Link>
        ) : null,
      )}
    </div>
  );
}
