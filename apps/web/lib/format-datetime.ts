const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Locale-stable datetime for SSR + client (avoids hydration mismatches). */
export function formatDateTimeFixed(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);

  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()]!;
  const year = d.getUTCFullYear();
  let hour = d.getUTCHours();
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;

  return `${day} ${month} ${year} at ${hour}:${minute} ${ampm} UTC`;
}

/** e.g. "7 Oct 2026 at 8:26 pm UTC" */
export function formatDateTimeReadable(iso: string | null | undefined): string {
  return formatDateTimeFixed(iso);
}
