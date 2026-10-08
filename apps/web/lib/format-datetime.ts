/** Locale-stable datetime for SSR + client (avoids hydration mismatches). */
export function formatDateTimeFixed(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  // Fixed locale + UTC so server and client render the same string.
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  })
    .format(d)
    .replace(/\b(am|pm)\b/gi, (m) => m.toLowerCase());
  return `${date} at ${time} UTC`;
}

/** e.g. "7 Oct 2026 at 8:26 pm UTC" */
export function formatDateTimeReadable(iso: string | null | undefined): string {
  return formatDateTimeFixed(iso);
}
