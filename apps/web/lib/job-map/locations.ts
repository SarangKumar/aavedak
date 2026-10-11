/**
 * Maps the free-text `jobs.location` of open shared jobs to known Indian cities for the
 * homepage openings globe. Pure (no DB) so it can be tested with plain node:assert.
 *
 * Location strings come straight from career sources and are messy ("hosur road bangalore,
 * India", "IN-Pune", "Bengaluru, KA, India · Bengaluru"). Only cities in the gazetteer below
 * are plotted; anything else is counted as remote or "elsewhere" rather than guessed.
 */

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

type CityDef = { id: string; name: string; lat: number; lng: number; aliases: string[] };

// Aliases are matched as whole words on the lowercased string. Neighbourhoods and tech
// parks that are inside a city map to that city ("hosur road" is in Bengaluru, while the
// town of Hosur is listed separately — the longer alias is matched first).
const CITIES: CityDef[] = [
  {
    id: "bengaluru",
    name: "Bengaluru",
    lat: 12.9716,
    lng: 77.5946,
    aliases: [
      "bengaluru",
      "bangalore",
      "banglore",
      "bengalore",
      "whitefield",
      "electronic city",
      "manyata",
      "hosur road",
    ],
  },
  { id: "hosur", name: "Hosur", lat: 12.7409, lng: 77.8253, aliases: ["hosur"] },
  { id: "mysuru", name: "Mysuru", lat: 12.2958, lng: 76.6394, aliases: ["mysuru", "mysore"] },
  {
    id: "mangaluru",
    name: "Mangaluru",
    lat: 12.9141,
    lng: 74.856,
    aliases: ["mangaluru", "mangalore"],
  },
  { id: "manipal", name: "Manipal", lat: 13.3525, lng: 74.7928, aliases: ["manipal"] },
  {
    id: "hyderabad",
    name: "Hyderabad",
    lat: 17.385,
    lng: 78.4867,
    aliases: ["hyderabad", "hyderbad", "secunderabad"],
  },
  {
    id: "chennai",
    name: "Chennai",
    lat: 13.0827,
    lng: 80.2707,
    aliases: ["chennai", "madras", "chenai"],
  },
  { id: "coimbatore", name: "Coimbatore", lat: 11.0168, lng: 76.9558, aliases: ["coimbatore"] },
  { id: "madurai", name: "Madurai", lat: 9.9252, lng: 78.1198, aliases: ["madurai"] },
  {
    id: "tiruchirappalli",
    name: "Tiruchirappalli",
    lat: 10.7905,
    lng: 78.7047,
    aliases: ["tiruchirappalli", "trichy"],
  },
  {
    id: "puducherry",
    name: "Puducherry",
    lat: 11.9416,
    lng: 79.8083,
    aliases: ["puducherry", "pondicherry"],
  },
  {
    id: "kochi",
    name: "Kochi",
    lat: 9.9312,
    lng: 76.2673,
    aliases: ["kochi", "cochin", "infopark"],
  },
  {
    id: "thiruvananthapuram",
    name: "Thiruvananthapuram",
    lat: 8.5241,
    lng: 76.9366,
    aliases: ["thiruvananthapuram", "trivandrum", "technopark"],
  },
  {
    id: "mumbai",
    name: "Mumbai",
    lat: 19.076,
    lng: 72.8777,
    aliases: ["mumbai", "bombay", "navi mumbai", "powai", "vikhroli", "airoli"],
  },
  { id: "thane", name: "Thane", lat: 19.2183, lng: 72.9781, aliases: ["thane"] },
  {
    id: "pune",
    name: "Pune",
    lat: 18.5204,
    lng: 73.8567,
    aliases: ["pune", "hinjewadi", "hinjawadi", "magarpatta", "kharadi", "pimpri", "chinchwad"],
  },
  { id: "nashik", name: "Nashik", lat: 19.9975, lng: 73.7898, aliases: ["nashik"] },
  { id: "nagpur", name: "Nagpur", lat: 21.1458, lng: 79.0882, aliases: ["nagpur"] },
  { id: "goa", name: "Goa", lat: 15.4909, lng: 73.8278, aliases: ["goa", "panaji"] },
  { id: "ahmedabad", name: "Ahmedabad", lat: 23.0225, lng: 72.5714, aliases: ["ahmedabad"] },
  {
    id: "gandhinagar",
    name: "Gandhinagar",
    lat: 23.2156,
    lng: 72.6369,
    aliases: ["gandhinagar", "gift city"],
  },
  { id: "vadodara", name: "Vadodara", lat: 22.3072, lng: 73.1812, aliases: ["vadodara", "baroda"] },
  { id: "surat", name: "Surat", lat: 21.1702, lng: 72.8311, aliases: ["surat"] },
  { id: "jaipur", name: "Jaipur", lat: 26.9124, lng: 75.7873, aliases: ["jaipur"] },
  { id: "indore", name: "Indore", lat: 22.7196, lng: 75.8577, aliases: ["indore"] },
  { id: "bhopal", name: "Bhopal", lat: 23.2599, lng: 77.4126, aliases: ["bhopal"] },
  {
    id: "delhi",
    name: "Delhi",
    lat: 28.6139,
    lng: 77.209,
    aliases: ["delhi", "new delhi", "delhi ncr", "ncr"],
  },
  {
    id: "gurugram",
    name: "Gurugram",
    lat: 28.4595,
    lng: 77.0266,
    aliases: ["gurugram", "gurgaon", "gurgoan"],
  },
  { id: "noida", name: "Noida", lat: 28.5355, lng: 77.391, aliases: ["noida", "greater noida"] },
  { id: "faridabad", name: "Faridabad", lat: 28.4089, lng: 77.3178, aliases: ["faridabad"] },
  { id: "ghaziabad", name: "Ghaziabad", lat: 28.6692, lng: 77.4538, aliases: ["ghaziabad"] },
  { id: "chandigarh", name: "Chandigarh", lat: 30.7333, lng: 76.7794, aliases: ["chandigarh"] },
  { id: "mohali", name: "Mohali", lat: 30.7046, lng: 76.7179, aliases: ["mohali"] },
  { id: "dehradun", name: "Dehradun", lat: 30.3165, lng: 78.0322, aliases: ["dehradun"] },
  { id: "lucknow", name: "Lucknow", lat: 26.8467, lng: 80.9462, aliases: ["lucknow"] },
  { id: "kanpur", name: "Kanpur", lat: 26.4499, lng: 80.3319, aliases: ["kanpur"] },
  {
    id: "shahjahanpur",
    name: "Shahjahanpur",
    lat: 27.8826,
    lng: 79.909,
    aliases: ["shahjahanpur"],
  },
  { id: "patna", name: "Patna", lat: 25.5941, lng: 85.1376, aliases: ["patna"] },
  { id: "ranchi", name: "Ranchi", lat: 23.3441, lng: 85.3096, aliases: ["ranchi"] },
  { id: "jamshedpur", name: "Jamshedpur", lat: 22.8046, lng: 86.2029, aliases: ["jamshedpur"] },
  { id: "kolkata", name: "Kolkata", lat: 22.5726, lng: 88.3639, aliases: ["kolkata", "calcutta"] },
  {
    id: "bhubaneswar",
    name: "Bhubaneswar",
    lat: 20.2961,
    lng: 85.8245,
    aliases: ["bhubaneswar"],
  },
  { id: "raipur", name: "Raipur", lat: 21.2514, lng: 81.6296, aliases: ["raipur"] },
  {
    id: "visakhapatnam",
    name: "Visakhapatnam",
    lat: 17.6868,
    lng: 83.2185,
    aliases: ["visakhapatnam", "vizag"],
  },
  { id: "vijayawada", name: "Vijayawada", lat: 16.5062, lng: 80.648, aliases: ["vijayawada"] },
  { id: "guwahati", name: "Guwahati", lat: 26.1445, lng: 91.7362, aliases: ["guwahati"] },
];

const CITY_BY_ID = new Map(CITIES.map((c) => [c.id, c]));

// Longest alias first, so "hosur road" claims its span before "hosur" can.
const ALIASES = CITIES.flatMap((city) =>
  city.aliases.map((alias) => ({ alias, id: city.id })),
).sort((a, b) => b.alias.length - a.alias.length);

function aliasRegex(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "g");
}
const ALIAS_PATTERNS = ALIASES.map(({ alias, id }) => ({ id, re: aliasRegex(alias) }));

const REMOTE_RE = /\b(?:remote|anywhere|worldwide|work from home|wfh)\b/i;

/** City ids mentioned in one location string, in gazetteer order, without duplicates. */
export function matchCities(location: string): string[] {
  let text = ` ${location.toLowerCase()} `;
  const found = new Set<string>();
  for (const { id, re } of ALIAS_PATTERNS) {
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    found.add(id);
    // Blank out the matched span so a shorter alias inside it can't match again.
    text = text.replace(re, (m) => " ".repeat(m.length));
  }
  return CITIES.filter((c) => found.has(c.id)).map((c) => c.id);
}

export function isRemoteLocation(location: string): boolean {
  return REMOTE_RE.test(location);
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

/** Aggregate grouped location counts into globe cities plus remote / elsewhere totals. */
export function summarizeJobLocations(rows: JobLocationCount[]): JobMapSummary {
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
