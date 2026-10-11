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

/** Minutes to add to a UTC instant to reach India Standard Time (UTC+5:30). */
const IST_OFFSET_MINUTES = 330;

/**
 * Locale-stable datetime in India Standard Time for SSR + client (avoids hydration
 * mismatches by using a fixed offset instead of the runtime locale/timezone).
 */
export function formatDateTimeFixed(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);

  const ist = new Date(d.getTime() + IST_OFFSET_MINUTES * 60_000);
  const day = ist.getUTCDate();
  const month = MONTHS[ist.getUTCMonth()]!;
  const year = ist.getUTCFullYear();
  let hour = ist.getUTCHours();
  const minute = String(ist.getUTCMinutes()).padStart(2, "0");
  const ampm = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;

  return `${day} ${month} ${year} at ${hour}:${minute} ${ampm} IST`;
}

/** e.g. "7 Oct 2026 at 8:26 pm IST" */
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
