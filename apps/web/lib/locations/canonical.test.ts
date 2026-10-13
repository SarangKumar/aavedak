import assert from "node:assert/strict";

import {
  CANONICAL_LOCATIONS,
  LOCATION_ENTRIES,
  canonicalLocation,
  isCanonicalLocation,
  locationCityKeys,
} from ".";

const cases: Array<[string, string | null]> = [
  ["Bangalore", "Bengaluru, India"],
  ["Bengaluru, Karnataka, India", "Bengaluru, India"],
  ["Gurgaon, Haryana", "Gurugram, India"],
  ["Bombay", "Mumbai, India"],
  ["Navi Mumbai, Maharashtra, India", "Mumbai, India"],
  ["Mysore, Karnataka, India", "Mysuru, India"],
  ["Thiruvananthapuram, Kerala, India", "Thiruvananthapuram, India"],
  ["Pune (Hybrid)", "Pune, India"],
  ["Remote", "Remote"],
  ["Remote - India", "Remote"],
  ["remote", "Remote"],
  ["bengaluru, india", "Bengaluru, India"],
  ["London, United Kingdom", "London, United Kingdom"],
  ["Bengaluru · Hyderabad", null],
  ["Hyderabad", "Hyderabad, India"],
  ["Hyderabad, Sindh, Pakistan", "Hyderabad, Pakistan"],
  ["São Paulo", "São Paulo, Brazil"],
  ["Sao Paulo, SP", "São Paulo, Brazil"],
  ["New York, NY", "New York, United States"],
  ["Berlin, Germany", "Berlin, Germany"],
  ["India", null],
  ["Magrahat-II, West Bengal, India", null],
  ["", null],
];
for (const [raw, want] of cases) assert.equal(canonicalLocation(raw), want, raw);

assert.equal(CANONICAL_LOCATIONS[0], "Remote");
assert.ok(CANONICAL_LOCATIONS.includes("Bengaluru, India"));
assert.equal(new Set(CANONICAL_LOCATIONS).size, CANONICAL_LOCATIONS.length);
assert.ok(isCanonicalLocation("Gurugram, India"));
assert.ok(!isCanonicalLocation("Gurgaon"));
assert.deepEqual(locationCityKeys("Bangalore · Gurgaon"), ["bengaluru, india", "gurugram, india"]);
for (const entry of LOCATION_ENTRIES) {
  assert.ok(Math.abs(entry.lat) <= 90 && Math.abs(entry.lng) <= 180, entry.name);
  assert.match(entry.countryCode, /^[A-Z]{2}$/);
}
assert.ok(LOCATION_ENTRIES.length > 500);
console.log("locations tests: ok");

// Stored-data migration helpers (lib/locations/migrate.ts).
void (async () => {
  const { canonicalDisplayLocation, dedupeKey } = await import("./migrate");
  assert.equal(
    canonicalDisplayLocation("Bangalore, Karnataka, India · Gurgaon · Magrahat-II, West Bengal"),
    "Bengaluru, India · Gurugram, India · Magrahat-II, West Bengal",
  );
  assert.equal(canonicalDisplayLocation("Bengaluru · Bangalore"), "Bengaluru, India");
  assert.equal(
    dedupeKey("Acme Inc", "Software  Engineer", "Bengaluru, India"),
    "acme inc|software engineer|bengaluru",
  );
  console.log("location migration tests: ok");
})();
