"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Tiny pub/sub so programmatic navigations (router.push from menus, the command palette)
 * can start the top progress bar the same instant a <Link> click does.
 * The bar itself lives in components/navigation-progress.tsx and finishes on URL change.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onNavigationStart(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startNavigationProgress(): void {
  for (const listener of listeners) listener();
}

/** True when navigating to `href` would actually change the page (not just a hash jump). */
export function isPageChange(href: string): boolean {
  try {
    const next = new URL(href, window.location.href);
    if (next.origin !== window.location.origin) return false;
    return next.pathname !== window.location.pathname || next.search !== window.location.search;
  } catch {
    return false;
  }
}

/**
 * router.push wrapper that shows progress immediately, plus a `prefetch` helper so menu items
 * can warm their route (and its loading skeleton) when the menu opens rather than on click.
 */
export function useAppNavigate() {
  const router = useRouter();
  const navigate = useCallback(
    (href: string) => {
      if (isPageChange(href)) startNavigationProgress();
      router.push(href);
    },
    [router],
  );
  const prefetch = useCallback(
    (...hrefs: string[]) => {
      for (const href of hrefs) router.prefetch(href);
    },
    [router],
  );
  return useMemo(() => ({ navigate, prefetch }), [navigate, prefetch]);
}
