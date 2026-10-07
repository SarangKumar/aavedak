export const THEME_KEY = "aavedak-theme";

export type ThemeMode = "light" | "dark" | "system";

export function parseThemeMode(value: string | undefined | null): ThemeMode {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

/**
 * Resolve whether SSR HTML should include `.dark`.
 * - explicit light/dark from cookie
 * - system: honor Sec-CH-Prefers-Color-Scheme when present
 * - otherwise dark-first (Aavedak brand default) to avoid light FOUC
 */
export function serverPrefersDark(
  mode: ThemeMode,
  prefersColorSchemeHeader?: string | null,
): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  const hint = prefersColorSchemeHeader?.toLowerCase();
  if (hint === "light") return false;
  if (hint === "dark") return true;
  return true;
}

/** Cookie attributes for theme preference (readable by the server on next request). */
export function themeCookieString(mode: ThemeMode): string {
  return `${THEME_KEY}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
