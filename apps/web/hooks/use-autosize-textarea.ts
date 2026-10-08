"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

export type UseAutosizeTextareaOptions = {
  /** Cap height before overflow scroll. Defaults to `min(80vh, 800)`. */
  maxHeightPx?: number | (() => number);
  /** When false, skip resizing (e.g. hidden panels). Default true. */
  enabled?: boolean;
};

function defaultMaxHeightPx() {
  if (typeof window === "undefined") return 800;
  return Math.min(window.innerHeight * 0.8, 800);
}

/** Measure content and grow the textarea up to `maxHeightPx`, then scroll. */
export function resizeTextarea(
  el: HTMLTextAreaElement | null,
  maxHeightPx: number = defaultMaxHeightPx(),
) {
  if (!el) return;
  const max = Math.max(0, maxHeightPx);

  // Temporarily unlock height so scrollHeight reflects content.
  const previous = el.style.height;
  el.style.overflowY = "hidden";
  el.style.height = "auto";

  const contentHeight = el.scrollHeight;
  const next = Math.min(contentHeight, max);

  // If measuring failed (0), restore previous height.
  if (contentHeight <= 0) {
    el.style.height = previous;
    return;
  }

  el.style.height = `${next}px`;
  el.style.overflowY = contentHeight > max ? "auto" : "hidden";
}

/**
 * Auto-grow a controlled `<textarea>` with its content.
 *
 * Avoid fixed `h-*` classes on the textarea (e.g. `h-8`) — use `h-auto` /
 * `min-h-*` + `resize-none` + `max-h-[min(80vh,800px)]` instead.
 *
 * @example
 * const { ref, resize } = useAutosizeTextarea(value);
 * <textarea
 *   ref={ref}
 *   value={value}
 *   onChange={(e) => { setValue(e.target.value); resize(); }}
 *   className="h-auto min-h-[6.5rem] max-h-[min(80vh,800px)] resize-none"
 * />
 */
export function useAutosizeTextarea(value: string, options: UseAutosizeTextareaOptions = {}) {
  const { maxHeightPx = defaultMaxHeightPx, enabled = true } = options;
  const ref = useRef<HTMLTextAreaElement>(null);

  const resolveMax = useCallback(() => {
    return typeof maxHeightPx === "function" ? maxHeightPx() : maxHeightPx;
  }, [maxHeightPx]);

  const resize = useCallback(() => {
    if (!enabled) return;
    resizeTextarea(ref.current, resolveMax());
  }, [enabled, resolveMax]);

  useLayoutEffect(() => {
    resize();
  }, [value, resize, enabled]);

  return { ref, resize };
}
