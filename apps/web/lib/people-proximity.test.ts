/** Run: npx --yes tsx lib/people-proximity.test.ts   (from apps/web) */
import assert from "node:assert/strict";

import { personProximity } from "./people-proximity";

const job = { location: "Bengaluru, India" };
assert.equal(personProximity({ location: "Bangalore, Karnataka" }, job).label, "Same city");
assert.equal(personProximity({ location: "Pune, India" }, job).label, "Same country");
assert.equal(personProximity({ location: "Berlin, Germany" }, job).label, "Other country");
assert.equal(personProximity({ location: null }, job).rank, 2);
assert.equal(personProximity({ location: null, countryCode: "IN" }, job).rank, 1);
assert.equal(personProximity({ location: "San Francisco, CA" }, { location: "Remote" }).rank, 2);
console.log("people-proximity tests passed");
