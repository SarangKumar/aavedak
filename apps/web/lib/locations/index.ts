/**
 * Canonical job locations: "City, Country" for known cities, plus "Remote".
 *
 * The list lives in `canonical-locations.json` (shared with FastAPI ingest, which keeps a
 * copy in `app/discovery/jobs/canonical_locations.json`; a pytest checks they match).
 * Forms only offer these values, and `canonicalLocation` maps parsed or legacy text onto
 * one of them when the match is unambiguous.
 */
import data from "./canonical-locations.json";

type CityEntry = { name: string; country: string; aliases: string[] };

export const REMOTE_LOCATION = data.remote;

const CITY_ENTRIES: CityEntry[] = data.cities;

function label(city: CityEntry): string {
  return `${city.name}, ${city.country}`;
}

/** Every canonical value: "Remote" first, then Indian cities A–Z, then other countries. */
export const CANONICAL_LOCATIONS: string[] = [
  REMOTE_LOCATION,
  ...CITY_ENTRIES.filter((c) => c.country === "India")
    .map(label)
    .sort((a, b) => a.localeCompare(b)),
  ...CITY_ENTRIES.filter((c) => c.country !== "India")
    .map(label)
    .sort((a, b) => a.localeCompare(b)),
];

const CANONICAL_BY_LOWER = new Map(CANONICAL_LOCATIONS.map((v) => [v.toLowerCase(), v]));

/** Search keywords for a canonical value (its aliases), for the combobox filter. */
export function locationKeywords(value: string): string[] {
  const city = CITY_ENTRIES.find((c) => label(c) === value);
  return city ? city.aliases : value === REMOTE_LOCATION ? data.remoteAliases : [];
}

export function isCanonicalLocation(value: string): boolean {
  return CANONICAL_BY_LOWER.get(value.trim().toLowerCase()) === value.trim();
}

function wordRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "gu");
}

// Longest alias first, so "navi mumbai" or "hosur road" claim their span before shorter ones.
const ALIAS_PATTERNS = CITY_ENTRIES.flatMap((city) =>
  city.aliases.map((alias) => ({ alias, city })),
)
  .sort((a, b) => b.alias.length - a.alias.length)
  .map(({ alias, city }) => ({ city, re: wordRegex(alias) }));

const COUNTRY_PATTERNS = Object.entries(data.countries as Record<string, string[]>).map(
  ([country, aliases]) => ({ country, res: aliases.map(wordRegex) }),
);
const REMOTE_PATTERNS = data.remoteAliases.map(wordRegex);

/**
 * The canonical location for free text, or null when it isn't a confident match:
 * exactly one known city (any spelling or alias, e.g. "Bangalore, Karnataka" → "Bengaluru,
 * India"), or "Remote" when only a remote phrase is present. Several cities, an unknown
 * city, a bare country, or a city named with a different country all give null.
 */
export function canonicalLocation(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const exact = CANONICAL_BY_LOWER.get(trimmed.toLowerCase());
  if (exact) return exact;

  let text = ` ${trimmed.toLowerCase().replace(/\((?:hybrid|on-?site|remote)\)/g, " ")} `;
  const cities = new Set<CityEntry>();
  for (const { city, re } of ALIAS_PATTERNS) {
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    cities.add(city);
    re.lastIndex = 0;
    text = text.replace(re, (m) => " ".repeat(m.length));
  }
  if (cities.size === 1) {
    const [city] = [...cities];
    const named = COUNTRY_PATTERNS.filter(({ res }) =>
      res.some((re) => {
        re.lastIndex = 0;
        return re.test(text);
      }),
    ).map((c) => c.country);
    if (named.length && !named.includes(city!.country)) return null;
    return label(city!);
  }
  if (cities.size > 1) return null;
  const remote = REMOTE_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
  return remote ? REMOTE_LOCATION : null;
}

/**
 * Canonical values for a list of free-text locations (profile preferences, legacy data).
 * Comma-separated text is read part by part ("Bangalore, Remote" → both); a whole
 * "City, Country" value is read as one. Unmappable parts are dropped; order kept, no dupes.
 */
export function canonicalLocationList(values: string[] | string, max = 12): string[] {
  const parts: string[] = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const whole = canonicalLocation(value);
    if (whole && isCanonicalLocation(whole) && whole.toLowerCase() === value.trim().toLowerCase()) {
      parts.push(whole);
      continue;
    }
    for (const piece of value.split(/[,;\n·|]/)) {
      const c = canonicalLocation(piece);
      if (c) parts.push(c);
    }
  }
  return [...new Set(parts)].slice(0, max);
}

/** Canonical city names in a location string (for preference matching), lowercased. */
export function locationCityKeys(raw: string): string[] {
  const keys = new Set<string>();
  for (const part of raw.split(/[·;|/]/)) {
    const c = canonicalLocation(part);
    if (c) keys.add(c.toLowerCase());
  }
  return [...keys];
}
