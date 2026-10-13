/**
 * Canonical job locations: "City, Country" for known cities, plus "Remote".
 *
 * Single source of truth: `data/locations/canonical-locations.json` at the repo root, built
 * from GeoNames by `scripts/build-locations.py` (coordinates, country code, admin-1 region,
 * population) and read by both this module and FastAPI (`app/discovery/jobs/locations.py`).
 * Forms only offer these values; `canonicalLocation` maps parsed or legacy text onto one
 * when the match is unambiguous.
 */
import data from "../../../../data/locations/canonical-locations.json";

export type LocationEntry = {
  /** GeoNames id. */
  id: number;
  name: string;
  country: string;
  countryCode: string;
  region: string;
  lat: number;
  lng: number;
  population: number;
  aliases: string[];
};

export const LOCATION_SOURCE = data.source;
export const REMOTE_LOCATION: string = data.remote;
export const LOCATION_ENTRIES: LocationEntry[] = data.cities;

export function locationLabel(city: Pick<LocationEntry, "name" | "country">): string {
  return `${city.name}, ${city.country}`;
}

/** Every canonical value: "Remote" first, then Indian cities A–Z, then the rest A–Z. */
export const CANONICAL_LOCATIONS: string[] = [
  REMOTE_LOCATION,
  ...LOCATION_ENTRIES.filter((c) => c.countryCode === "IN")
    .map(locationLabel)
    .sort((a, b) => a.localeCompare(b)),
  ...LOCATION_ENTRIES.filter((c) => c.countryCode !== "IN")
    .map(locationLabel)
    .sort((a, b) => a.localeCompare(b)),
];

const ENTRY_BY_LABEL = new Map(LOCATION_ENTRIES.map((c) => [locationLabel(c), c]));
const CANONICAL_BY_LOWER = new Map(CANONICAL_LOCATIONS.map((v) => [v.toLowerCase(), v]));

/** The entry (coordinates, region, …) for a canonical value, or null (also for "Remote"). */
export function locationEntry(value: string): LocationEntry | null {
  return ENTRY_BY_LABEL.get(value) ?? null;
}

/** Search keywords for a canonical value (its aliases and region), for the combobox filter. */
export function locationKeywords(value: string): string[] {
  const city = ENTRY_BY_LABEL.get(value);
  if (city) return [...city.aliases, city.region, city.countryCode].filter(Boolean);
  return value === REMOTE_LOCATION ? data.remoteAliases : [];
}

export function isCanonicalLocation(value: string): boolean {
  return CANONICAL_BY_LOWER.get(value.trim().toLowerCase()) === value.trim();
}

function wordRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "gu");
}

// One pattern per alias (longest first, so "navi mumbai" claims its span before "mumbai");
// an alias several cities share ("hyderabad") lists all of them.
const ALIAS_PATTERNS: Array<{ re: RegExp; cities: LocationEntry[] }> = (() => {
  const byAlias = new Map<string, LocationEntry[]>();
  for (const city of LOCATION_ENTRIES) {
    for (const alias of city.aliases) {
      const list = byAlias.get(alias) ?? [];
      if (!list.includes(city)) list.push(city);
      byAlias.set(alias, list);
    }
  }
  return [...byAlias.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([alias, cities]) => ({
      re: wordRegex(alias),
      cities: [...cities].sort((a, b) => b.population - a.population),
    }));
})();

const COUNTRY_PATTERNS = Object.entries(data.countries as Record<string, string[]>).map(
  ([code, names]) => ({ code, res: names.map(wordRegex) }),
);
const REMOTE_PATTERNS = data.remoteAliases.map(wordRegex);

function test(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  return re.test(text);
}

/**
 * Pick one city for an alias several cities share: the one in a country the text names,
 * else the most populous when it is at least twice the next (Hyderabad → India). Else none.
 */
function resolveShared(cities: LocationEntry[], namedCountries: string[]): LocationEntry | null {
  if (cities.length === 1) return cities[0]!;
  const inNamed = cities.filter((c) => namedCountries.includes(c.countryCode));
  if (inNamed.length === 1) return inNamed[0]!;
  const [first, second] = cities;
  return first && second && first.population >= 2 * second.population ? first : null;
}

function namedCountryCodes(text: string): string[] {
  return COUNTRY_PATTERNS.filter(({ res }) => res.some((re) => test(re, text))).map((c) => c.code);
}

/**
 * Every known city named in free text, most populous first, without duplicates. Shared
 * aliases are resolved as in `resolveShared`; unresolved ones are skipped.
 */
export function findCities(raw: string): LocationEntry[] {
  let text = ` ${raw.toLowerCase().replace(/\((?:hybrid|on-?site|remote)\)/g, " ")} `;
  const countries = namedCountryCodes(text);
  const found = new Set<LocationEntry>();
  for (const { re, cities } of ALIAS_PATTERNS) {
    if (!test(re, text)) continue;
    const city = resolveShared(cities, countries);
    if (city) found.add(city);
    re.lastIndex = 0;
    text = text.replace(re, (m) => " ".repeat(m.length));
  }
  return [...found].sort((a, b) => b.population - a.population);
}

export function isRemoteText(raw: string): boolean {
  const text = ` ${raw.toLowerCase()} `;
  return REMOTE_PATTERNS.some((re) => test(re, text));
}

/**
 * The canonical location for free text, or null when it isn't a confident match: exactly
 * one known city (any spelling or alias, e.g. "Bangalore, Karnataka" → "Bengaluru, India"),
 * or "Remote" when only a remote phrase is present. Several cities, an unknown city, a bare
 * country, or a city named with a different country all give null.
 */
export function canonicalLocation(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const exact = CANONICAL_BY_LOWER.get(trimmed.toLowerCase());
  if (exact) return exact;

  const cities = findCities(trimmed);
  if (cities.length === 1) {
    const city = cities[0]!;
    const named = namedCountryCodes(` ${trimmed.toLowerCase()} `);
    if (named.length && !named.includes(city.countryCode)) return null;
    return locationLabel(city);
  }
  if (cities.length > 1) return null;
  return isRemoteText(trimmed) ? REMOTE_LOCATION : null;
}

/**
 * Canonical values for a list of free-text locations (profile preferences, legacy data).
 * Comma-separated text is read part by part ("Bangalore, Remote" → both); a whole
 * "City, Country" value is read as one. Unmappable parts are dropped; order kept, no dupes.
 */
export function canonicalLocationList(values: string[] | string, max = 12): string[] {
  const parts: string[] = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    if (isCanonicalLocation(value)) {
      parts.push(value.trim());
      continue;
    }
    for (const piece of value.split(/[,;\n·|]/)) {
      const c = canonicalLocation(piece);
      if (c) parts.push(c);
    }
  }
  return [...new Set(parts)].slice(0, max);
}

/** Canonical values of the places in a location string (for preference matching), lowercased. */
export function locationCityKeys(raw: string): string[] {
  const keys = new Set<string>();
  for (const city of findCities(raw)) keys.add(locationLabel(city).toLowerCase());
  if (isRemoteText(raw)) keys.add(REMOTE_LOCATION.toLowerCase());
  return [...keys];
}
