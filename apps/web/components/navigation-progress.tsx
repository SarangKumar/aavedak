"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { isPageChange, onNavigationStart } from "@/lib/navigation-progress";

/** Give up quietly if a navigation never commits (e.g. it was cancelled or errored). */
const MAX_VISIBLE_MS = 15_000;

/**
 * Thin bar at the top of the viewport that appears the moment an internal link is clicked,
 * before the server has answered. It trickles toward 90% and completes when the URL changes,
 * so slow (cold-start) navigations never feel like a dead click.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const timers = useRef<number[]>([]);

  function clearTimers() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }

  function start() {
    clearTimers();
    setFading(false);
    setProgress(8);
    // Ease toward 90% without ever "finishing" before the route actually commits.
    const steps = [30, 50, 65, 75, 82, 87, 90];
    steps.forEach((value, i) => {
      timers.current.push(window.setTimeout(() => setProgress(value), 120 + i * 350));
    });
    timers.current.push(window.setTimeout(finish, MAX_VISIBLE_MS));
  }

  function finish() {
    clearTimers();
    setProgress((current) => (current === null ? null : 100));
    // Hold at 100% briefly, fade out (opacity), then reset width once invisible.
    timers.current.push(window.setTimeout(() => setFading(true), 200));
    timers.current.push(
      window.setTimeout(() => {
        setProgress(null);
        setFading(false);
      }, 450),
    );
  }

  // Internal <a>/<Link> clicks (capture phase, so it runs before Next handles the click).
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (!isPageChange(anchor.href)) return;
      start();
    }
    document.addEventListener("click", onClick, true);
    const unsubscribe = onNavigationStart(start);
    return () => {
      document.removeEventListener("click", onClick, true);
      unsubscribe();
      clearTimers();
    };
    // start/finish only touch refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The new URL has committed: complete the bar.
  useEffect(() => {
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: progress === null || fading ? 0 : 1, transition: "opacity 250ms" }}
    >
      <div
        className="bg-primary h-full shadow-[0_0_8px_var(--color-primary)]"
        style={{
          width: `${progress ?? 0}%`,
          transition: progress === null ? "none" : "width 300ms ease-out",
        }}
      />
    </div>
  );
}
