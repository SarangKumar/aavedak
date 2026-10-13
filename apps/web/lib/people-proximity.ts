/**
 * How close a person is to a job, for ordering referral contacts: same city first, then same
 * country, then people whose location is unknown, and people in another country last
 * (still shown, labelled). Pure; uses the shared canonical locations.
 */

import { findCities, namedCountryCodes } from "@/lib/locations";

export type Proximity = {
  /** 0 same city · 1 same country · 2 unknown (or the job has no place) · 3 other country */
  rank: 0 | 1 | 2 | 3;
  label: "Same city" | "Same country" | "Other country" | null;
};

type Place = { cityIds: Set<number>; countries: Set<string> };

function place(raw: string | null | undefined, countryCode?: string | null): Place {
  const text = (raw ?? "").trim();
  const cities = text ? findCities(text) : [];
  const countries = new Set(cities.map((c) => c.countryCode));
  if (countries.size === 0 && text) {
    for (const code of namedCountryCodes(` ${text.toLowerCase()} `)) countries.add(code);
  }
  if (countryCode) countries.add(countryCode.toUpperCase());
  return { cityIds: new Set(cities.map((c) => c.id)), countries };
}

export function personProximity(
  person: { location?: string | null; countryCode?: string | null },
  job: { location?: string | null; countryCode?: string | null },
): Proximity {
  const jobPlace = place(job.location, job.countryCode);
  const personPlace = place(person.location, person.countryCode);
  if (jobPlace.countries.size === 0 || personPlace.countries.size === 0) {
    return { rank: 2, label: null };
  }
  if ([...personPlace.cityIds].some((id) => jobPlace.cityIds.has(id))) {
    return { rank: 0, label: "Same city" };
  }
  if ([...personPlace.countries].some((c) => jobPlace.countries.has(c))) {
    return { rank: 1, label: "Same country" };
  }
  return { rank: 3, label: "Other country" };
}
