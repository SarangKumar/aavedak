import { Badge } from "@/components/ui/badge";

/** Labels for `people.discovery_source` (mirrors SOURCE_LABELS in the API). */
const SOURCE_LABELS: Record<string, string> = {
  company_site: "Company website",
  github: "GitHub",
  hunter: "Hunter",
  apollo: "Apollo",
  search: "Web search",
  careers_inbox: "Careers page",
  admin_csv: "CSV import",
};

export type PersonProvenance = {
  origin?: "system" | "user";
  discoverySource?: string | null;
  confidence?: number | null;
  inferredEmail?: string | null;
  inferredEmailConfidence?: number | null;
};

function confidenceTone(c: number): string {
  if (c >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (c >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

/**
 * Where a discovered contact came from and how sure we are. Shown on People and Referrals.
 * User-added contacts show nothing (their data is the user's own).
 */
export function PersonSourceBadges({ person }: { person: PersonProvenance }) {
  if (person.origin !== "system") return null;
  const source = person.discoverySource
    ? (SOURCE_LABELS[person.discoverySource] ?? person.discoverySource)
    : "Discovered";
  return (
    <span className="inline-flex items-center gap-1">
      <Badge
        variant="outline"
        className="px-1.5 py-0 text-[10px]"
        title="Found automatically from public sources. Every field keeps its source URL."
      >
        {source}
      </Badge>
      {typeof person.confidence === "number" ? (
        <Badge
          variant="outline"
          className={`px-1.5 py-0 text-[10px] tabular-nums ${confidenceTone(person.confidence)}`}
          title="How confident discovery is that this person works at this company (0–100)."
        >
          {person.confidence}%
        </Badge>
      ) : null}
    </span>
  );
}

/** Primary email, else a clearly-labelled guess from the company's email pattern. */
export function PersonEmail({
  email,
  person,
  empty = "—",
}: {
  email: string | null;
  person: PersonProvenance;
  empty?: string;
}) {
  if (email) return <>{email}</>;
  if (person.inferredEmail) {
    return (
      <span title="Guessed from the company's published email format and not verified. Double-check before sending.">
        {person.inferredEmail}{" "}
        <Badge variant="outline" className="px-1 py-0 text-[9px]">
          inferred
          {typeof person.inferredEmailConfidence === "number"
            ? ` ${person.inferredEmailConfidence}%`
            : ""}
        </Badge>
      </span>
    );
  }
  return <>{empty}</>;
}
