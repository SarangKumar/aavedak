/**
 * Maps the free-text `jobs.location` of open shared jobs to known cities (the shared canonical locations) for the
 * homepage openings globe. Pure (no DB) so it can be tested with plain node:assert.
 *
 * Location strings come straight from career sources and are messy ("hosur road bangalore,
 * India", "IN-Pune", "Bengaluru, KA, India · Bengaluru"). Only cities in the gazetteer below
 * are plotted; anything else is counted as remote or "elsewhere" rather than guessed.
 */

import { LOCATION_ENTRIES, findCities, isRemoteText } from "@/lib/locations";

/** Open roles sharing one location string (and, optionally, one company). */
export type JobLocationCount = { location: string; count: number; company?: string | null };

export type LabelSide = "top" | "bottom";

export type GlobeCity = {
  /** Stable slug, also used for the cobe marker id / CSS anchor name. */
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Open roles listing this city (a multi-city role counts once in each city). */
  count: number;
  /** Where the on-globe label sits, or null for a dot only (LABEL_MIN_COUNT roles or fewer). */
  label: LabelSide | null;
  /** Distinct companies hiring here. */
  companyCount: number;
};

export type JobMapSummary = {
  cities: GlobeCity[];
  /** Distinct open roles considered. */
  totalOpenings: number;
  /** Roles with no known city that are remote (worldwide / APAC / "Remote - India"). */
  remoteCount: number;
  /** Roles with no known city that are not remote ("India", unlisted towns). */
  elsewhereCount: number;
  /** Distinct companies across all open roles. */
  companyCount: number;
};

type CityDef = { id: string; name: string; lat: number; lng: number };

// The gazetteer is the shared canonical locations file (GeoNames coordinates); aliases,
// neighbourhoods ("hosur road" → Bengaluru) and shared names ("Hyderabad") are resolved
// by `findCities`. Ids are the city's slug, with the country code added on a name clash.
function slug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const ID_BY_GEONAME = new Map<number, string>();
const CITY_BY_ID = new Map<string, CityDef>();
for (const city of [...LOCATION_ENTRIES].sort((x, y) => y.population - x.population)) {
  let id = slug(city.name);
  if (CITY_BY_ID.has(id)) id = `${id}-${city.countryCode.toLowerCase()}`;
  ID_BY_GEONAME.set(city.id, id);
  CITY_BY_ID.set(id, { id, name: city.name, lat: city.lat, lng: city.lng });
}

/** City ids mentioned in one location string, most populous first, without duplicates. */
export function matchCities(location: string): string[] {
  return findCities(location).map((c) => ID_BY_GEONAME.get(c.id)!);
}

export function isRemoteLocation(location: string): boolean {
  return isRemoteText(location);
}

/** Great-circle distance in degrees of arc. */
function arcDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const cos =
    Math.sin(a.lat * rad) * Math.sin(b.lat * rad) +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((a.lng - b.lng) * rad);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / rad;
}

// Cities with more than this many open roles get a label; the rest are a primary-colour dot
// (hovering the dot shows the same name + count pill).
export const LABEL_MIN_COUNT = 1;

// The homepage globe plots a city only when it has MORE than this many open roles, so the
// globe shows places genuinely worth looking at rather than a dot for every one-off posting.
// Passed in by `job-map/query.ts`; the summarizer itself keeps every city by default, since
// the Jobs page's location filter needs them all.
export const GLOBE_CITY_MIN_COUNT = 25;

// Each label sits above or below its dot. Pick the side away from bigger nearby cities so
// close pairs (Bengaluru / Coimbatore) can both be labelled. A busy city is always labelled:
// with neither side free it takes the side with fewer clashes. The globe still hides a label
// that overlaps a bigger city's label on screen at runtime (its dot stays).
const LABEL_SEPARATION_DEG = 5;

function labelConflicts(
  city: GlobeCity,
  side: LabelSide,
  other: GlobeCity & { label: LabelSide },
): boolean {
  if (arcDegrees(city, other) >= LABEL_SEPARATION_DEG) return false;
  if (other.label === side) return true;
  // A label growing toward a neighbour whose label grows back toward it.
  if (side === "top" && other.label === "bottom" && other.lat > city.lat) return true;
  if (side === "bottom" && other.label === "top" && other.lat < city.lat) return true;
  return false;
}

function assignLabels(cities: GlobeCity[]): void {
  const labeled: Array<GlobeCity & { label: LabelSide }> = [];
  for (const city of cities) {
    if (city.count <= LABEL_MIN_COUNT) continue;
    const clashes = (side: LabelSide) =>
      labeled.filter((other) => labelConflicts(city, side, other)).length;
    const side: LabelSide = clashes("top") <= clashes("bottom") ? "top" : "bottom";
    city.label = side;
    labeled.push(city as GlobeCity & { label: LabelSide });
  }
}

/** Options for `summarizeJobLocations`. */
export type SummarizeOptions = {
  /** Drop cities with this many open roles or fewer (0 = keep every city). */
  minCityCount?: number;
};

/** Aggregate grouped location counts into globe cities plus remote / elsewhere totals.
 *
 * The remote / elsewhere / total / company counts always cover every row, so they stay true
 * however `minCityCount` thins the plotted cities.
 */
export function summarizeJobLocations(
  rows: JobLocationCount[],
  { minCityCount = 0 }: SummarizeOptions = {},
): JobMapSummary {
  type CityAgg = { count: number; companies: Set<string> };
  const byCity = new Map<string, CityAgg>();
  const allCompanies = new Set<string>();
  let totalOpenings = 0;
  let remoteCount = 0;
  let elsewhereCount = 0;

  for (const { location, count, company } of rows) {
    if (!Number.isFinite(count) || count <= 0) continue;
    totalOpenings += count;
    // Companies are counted case-insensitively ("Acme" and "acme" are one company).
    const companyKey = company?.trim().toLowerCase() || null;
    if (companyKey) allCompanies.add(companyKey);
    const ids = matchCities(location ?? "");
    if (ids.length === 0) {
      if (isRemoteLocation(location ?? "")) remoteCount += count;
      else elsewhereCount += count;
      continue;
    }
    for (const id of ids) {
      const agg: CityAgg = byCity.get(id) ?? { count: 0, companies: new Set() };
      agg.count += count;
      if (companyKey) agg.companies.add(companyKey);
      byCity.set(id, agg);
    }
  }

  const cities: GlobeCity[] = [...byCity.entries()]
    .filter(([, agg]) => agg.count > minCityCount)
    .map(([id, agg]) => {
      const def = CITY_BY_ID.get(id)!;
      return {
        id,
        name: def.name,
        lat: def.lat,
        lng: def.lng,
        count: agg.count,
        label: null,
        companyCount: agg.companies.size,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  assignLabels(cities);

  return { cities, totalOpenings, remoteCount, elsewhereCount, companyCount: allCompanies.size };
}

// --- Jobs page location filter -----------------------------------------------------
// The Jobs board's location menu (/jobs?location=<city id | remote>) and its search box
// (/jobs?q=<city name>, which the homepage globe links to) both use this matching, so a
// city's dot and the filtered list agree however a posting spells the city.

export const REMOTE_LOCATION_FILTER = "remote";

/** Display name for a filter value, or null when it isn't a known city / "remote". */
export function locationFilterLabel(value: string): string | null {
  if (value === REMOTE_LOCATION_FILTER) return "Remote";
  return CITY_BY_ID.get(value)?.name ?? null;
}

/** Location filter keys one job's location string belongs to (cities, plus "remote"). */
export function locationFilterKeys(location: string): string[] {
  const keys = matchCities(location);
  if (isRemoteLocation(location)) keys.push(REMOTE_LOCATION_FILTER);
  return keys;
}

/** Jobs board with the search box set to `query` (e.g. a city name from the globe). */
export function jobsSearchHref(query: string): string {
  return `/jobs?q=${encodeURIComponent(query)}`;
}
