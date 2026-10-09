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

/**
 * Locale-stable calendar date, e.g. "22 Sep 2026" (SSR-safe). `zone: "ist"` shifts to India
 * time first — use it for real timestamps (createdAt). Date-only values such as applied dates
 * are stored as UTC midnight, so they use the default UTC zone to keep the picked day.
 */
export function formatDateOnly(
  iso: string | null | undefined,
  opts?: { zone?: "utc" | "ist" },
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const shifted = opts?.zone === "ist" ? new Date(d.getTime() + 330 * 60_000) : d;
  return `${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]!} ${shifted.getUTCFullYear()}`;
}
