/**
 * Job-map location parsing tests (plain node:assert, no framework).
 * Run: npx --yes tsx lib/job-map/run-tests.ts   (from apps/web)
 */
import assert from "node:assert/strict";

import {
  GLOBE_CITY_MIN_COUNT,
  isRemoteLocation,
  jobsSearchHref,
  locationFilterKeys,
  locationFilterLabel,
  matchCities,
  summarizeJobLocations,
} from "./locations";

function testMatchCities() {
  // Real strings seen in the shared feed.
  assert.deepEqual(matchCities("bangalore, India"), ["bengaluru"]);
  assert.deepEqual(matchCities("Bengaluru, KA, India"), ["bengaluru"]);
  assert.deepEqual(matchCities("IN-Pune"), ["pune"]);
  assert.deepEqual(matchCities("Bengaluru · Bengaluru, Karnataka, India"), ["bengaluru"]);
  assert.deepEqual(matchCities("Bengaluru · New Delhi · Mumbai"), ["mumbai", "delhi", "bengaluru"]);
  assert.deepEqual(matchCities("London, UK · Berlin"), ["london", "berlin"]);
  assert.deepEqual(matchCities("Hyderabad, Sindh, Pakistan"), ["hyderabad-pk"]);
  assert.deepEqual(matchCities("India · Hyderabad, Telangana, India"), ["hyderabad"]);
  assert.deepEqual(matchCities("Bangalore, India; Remote, Poland · India"), ["bengaluru"]);
  // "hosur road" is a Bengaluru road, not the town of Hosur.
  assert.deepEqual(matchCities("hosur road bangalore, India"), ["bengaluru"]);
  assert.deepEqual(matchCities("Hosur, TN, India"), ["hosur"]);
  // Unknown towns and bare country names are not guessed.
  assert.deepEqual(matchCities("Kurli, MH, India"), []);
  assert.deepEqual(matchCities("India"), []);
  assert.deepEqual(matchCities(""), []);
  // Whole words only.
  assert.deepEqual(matchCities("Punesque Labs, Goalpara"), []);
}

function testRemote() {
  assert.ok(isRemoteLocation("Remote, Global"));
  assert.ok(isRemoteLocation("Remote - India"));
  assert.ok(!isRemoteLocation("India Locations"));
}

function testSummary() {
  const summary = summarizeJobLocations([
    { location: "bangalore, India", count: 20 },
    { location: "Bengaluru, KA, India", count: 8 },
    { location: "coimbatore, India", count: 14 },
    { location: "Mysuru, KA, India", count: 1 },
    { location: "Bengaluru · New Delhi · Mumbai", count: 1 },
    { location: "Remote, APAC", count: 2 },
    { location: "India", count: 3 },
    { location: "Kurli, MH, India", count: 1 },
    { location: "ignored", count: 0 },
  ]);
  assert.equal(summary.totalOpenings, 50);
  assert.equal(summary.remoteCount, 2);
  assert.equal(summary.elsewhereCount, 4);

  const byId = Object.fromEntries(summary.cities.map((c) => [c.id, c]));
  assert.equal(byId.bengaluru.count, 29); // multi-city role counts in each city
  assert.equal(byId.delhi.count, 1);
  assert.equal(summary.cities[0].id, "bengaluru"); // sorted by count

  // More than 1 role → label. Coimbatore is ~2° from Bengaluru: its label flips below.
  assert.equal(byId.bengaluru.label, "top");
  assert.equal(byId.coimbatore.label, "bottom");
  // A single role → dot only, however far from other cities.
  assert.equal(byId.mysuru.label, null);
  assert.equal(byId.delhi.label, null);

  const empty = summarizeJobLocations([]);
  assert.deepEqual(empty, {
    cities: [],
    totalOpenings: 0,
    remoteCount: 0,
    elsewhereCount: 0,
    companyCount: 0,
  });
}

function testLabelThreshold() {
  const summary = summarizeJobLocations([
    { location: "Bengaluru", count: 30 },
    { location: "Coimbatore", count: 12 },
    { location: "Mysuru", count: 2 }, // between the two, both sides taken: still labelled
    { location: "Pune", count: 1 }, // exactly 1: dot only
    { location: "Mumbai", count: 2 },
  ]);
  const byId = Object.fromEntries(summary.cities.map((c) => [c.id, c]));
  assert.notEqual(byId.mysuru.label, null);
  assert.equal(byId.pune.label, null);
  assert.equal(byId.mumbai.label, "top");
  // Every city is still returned (and drawn as a dot), labelled or not.
  assert.equal(summary.cities.length, 5);
}

function testGlobeCityThreshold() {
  const rows = [
    { location: "Bengaluru", count: 120, company: "Acme" },
    { location: "Pune", count: 26, company: "Zeta" },
    { location: "Hyderabad, Telangana, India", count: 25, company: "Orbit" },
    { location: "Mysuru", count: 3, company: "Nine" },
    { location: "Remote, APAC", count: 7, company: "Far" },
    { location: "India", count: 4, company: "Vague" },
  ];
  // The homepage passes the threshold; "more than 25" means 25 exactly is dropped.
  const globe = summarizeJobLocations(rows, { minCityCount: GLOBE_CITY_MIN_COUNT });
  assert.deepEqual(
    globe.cities.map((c) => c.id),
    ["bengaluru", "pune"],
  );
  // Totals still cover every row, so the headline counts do not shrink with the dots.
  assert.equal(globe.totalOpenings, 185);
  assert.equal(globe.remoteCount, 7);
  assert.equal(globe.elsewhereCount, 4);
  assert.equal(globe.companyCount, 6);
  // Labels are assigned on the cities that survive the threshold.
  assert.equal(
    globe.cities.every((c) => c.label !== null),
    true,
  );

  // The default keeps every city: the Jobs page's location filter needs them all.
  assert.equal(summarizeJobLocations(rows).cities.length, 4);
}

function testCompanyCounts() {
  const summary = summarizeJobLocations([
    { location: "Bangalore", count: 2, company: "Acme" },
    { location: "Bengaluru, KA", count: 1, company: "acme " },
    { location: "Bengaluru", count: 1, company: "Zeta" },
    { location: "Pune", count: 1, company: "Acme" },
    { location: "Remote, APAC", count: 1, company: "Orbit" },
  ]);
  const blr = summary.cities.find((c) => c.id === "bengaluru")!;
  assert.equal(blr.count, 4);
  assert.equal(blr.companyCount, 2); // Acme counted once, whatever the casing
  assert.equal(summary.cities.find((c) => c.id === "pune")!.companyCount, 1);
  assert.equal(summary.companyCount, 3); // includes companies hiring remote only
}

function testLocationFilter() {
  assert.deepEqual(locationFilterKeys("Bangalore, India; Remote, Poland · India"), [
    "bengaluru",
    "remote",
  ]);
  assert.deepEqual(locationFilterKeys("Remote, APAC"), ["remote"]);
  assert.deepEqual(locationFilterKeys("India"), []);
  assert.equal(locationFilterLabel("bengaluru"), "Bengaluru");
  assert.equal(locationFilterLabel("remote"), "Remote");
  assert.equal(locationFilterLabel("atlantis"), null);
  assert.equal(jobsSearchHref("Bengaluru"), "/jobs?q=Bengaluru");
  assert.equal(jobsSearchHref("New Delhi"), "/jobs?q=New%20Delhi");
}

testMatchCities();
testLocationFilter();
testRemote();
testSummary();
testLabelThreshold();
testGlobeCityThreshold();
testCompanyCounts();
console.log("job-map tests passed");
