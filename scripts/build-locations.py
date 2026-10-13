#!/usr/bin/env python3
"""Build data/locations/canonical-locations.json from GeoNames (https://www.geonames.org/,
CC BY 4.0): cities15000.txt, admin1CodesASCII.txt and countryInfo.txt from
https://download.geonames.org/export/dump/.

    python3 scripts/build-locations.py /path/to/geonames-dump-dir

Selection: every populated place with population >= 1,000,000 worldwide, Indian cities
>= 500,000, plus the curated cities below (names Aavedak already stores, with their
aliases). Sections of cities (PPLX) are skipped unless curated. Coordinates, country code,
region (admin-1) and population come from GeoNames; display names and extra aliases for
curated cities are ours. One entry per GeoNames id and per (name, country).
"""

from __future__ import annotations

import json
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/locations/canonical-locations.json"
WORLD_MIN = 1_000_000
INDIA_MIN = 500_000

# Curated: (display name, country code, GeoNames name to look up, extra aliases).
CURATED: list[tuple[str, str, str, list[str]]] = [
    ("Bengaluru", "IN", "Bengaluru", ["bangalore", "banglore", "bengalore", "bengaluru urban", "bangalore urban", "whitefield", "electronic city", "manyata", "hosur road"]),
    ("Hosur", "IN", "Hosur", []),
    ("Mysuru", "IN", "Mysore", ["mysore"]),
    ("Mangaluru", "IN", "Mangalore", ["mangalore"]),
    ("Manipal", "IN", "Manipal", []),
    ("Hyderabad", "IN", "Hyderabad", ["hyderbad", "secunderabad"]),
    ("Chennai", "IN", "Chennai", ["madras", "chenai"]),
    ("Coimbatore", "IN", "Coimbatore", []),
    ("Madurai", "IN", "Madurai", []),
    ("Tiruchirappalli", "IN", "Tiruchirappalli", ["trichy"]),
    ("Puducherry", "IN", "Puducherry", ["pondicherry"]),
    ("Kochi", "IN", "Kochi", ["cochin", "infopark"]),
    ("Thiruvananthapuram", "IN", "Thiruvananthapuram", ["trivandrum", "technopark"]),
    ("Mumbai", "IN", "Mumbai", ["bombay", "navi mumbai", "powai", "vikhroli", "airoli", "greater mumbai", "mumbai metropolitan region"]),
    ("Thane", "IN", "Thane", []),
    ("Pune", "IN", "Pune", ["poona", "hinjewadi", "hinjawadi", "magarpatta", "kharadi", "pimpri", "chinchwad", "pimpri-chinchwad"]),
    ("Nashik", "IN", "Nashik", ["nasik"]),
    ("Nagpur", "IN", "Nagpur", []),
    ("Goa", "IN", "Panaji", ["goa", "panaji", "panjim"]),
    ("Ahmedabad", "IN", "Ahmedabad", []),
    ("Gandhinagar", "IN", "Gandhinagar", ["gift city"]),
    ("Vadodara", "IN", "Vadodara", ["baroda"]),
    ("Surat", "IN", "Surat", []),
    ("Jaipur", "IN", "Jaipur", []),
    ("Indore", "IN", "Indore", []),
    ("Bhopal", "IN", "Bhopal", []),
    ("Delhi", "IN", "Delhi", ["new delhi", "delhi ncr", "ncr"]),
    ("Gurugram", "IN", "Gurgaon", ["gurgaon", "gurgoan"]),
    ("Noida", "IN", "Noida", ["greater noida"]),
    ("Faridabad", "IN", "Faridabad", []),
    ("Ghaziabad", "IN", "Ghaziabad", []),
    ("Chandigarh", "IN", "Chandigarh", []),
    ("Mohali", "IN", "Mohali", ["sahibzada ajit singh nagar"]),
    ("Dehradun", "IN", "Dehradun", []),
    ("Lucknow", "IN", "Lucknow", []),
    ("Kanpur", "IN", "Kanpur", []),
    ("Shahjahanpur", "IN", "Shahjahanpur", []),
    ("Patna", "IN", "Patna", []),
    ("Ranchi", "IN", "Ranchi", []),
    ("Jamshedpur", "IN", "Jamshedpur", []),
    ("Kolkata", "IN", "Kolkata", ["calcutta"]),
    ("Bhubaneswar", "IN", "Bhubaneswar", []),
    ("Raipur", "IN", "Raipur", []),
    ("Visakhapatnam", "IN", "Visakhapatnam", ["vizag"]),
    ("Vijayawada", "IN", "Vijayawada", []),
    ("Guwahati", "IN", "Guwahati", []),
    ("Singapore", "SG", "Singapore", []),
    ("Dubai", "AE", "Dubai", []),
    ("Abu Dhabi", "AE", "Abu Dhabi", []),
    ("London", "GB", "London", []),
    ("Dublin", "IE", "Dublin", []),
    ("Berlin", "DE", "Berlin", []),
    ("Munich", "DE", "Munich", ["münchen", "muenchen"]),
    ("Amsterdam", "NL", "Amsterdam", []),
    ("Paris", "FR", "Paris", []),
    ("Toronto", "CA", "Toronto", []),
    ("Vancouver", "CA", "Vancouver", []),
    ("New York", "US", "New York City", ["new york city", "nyc"]),
    ("San Francisco", "US", "San Francisco", ["san francisco bay area"]),
    ("Seattle", "US", "Seattle", []),
    ("Austin", "US", "Austin", []),
    ("Boston", "US", "Boston", []),
    ("Sydney", "AU", "Sydney", []),
    ("Melbourne", "AU", "Melbourne", []),
    ("Tokyo", "JP", "Tokyo", []),
    ("Kuala Lumpur", "MY", "Kuala Lumpur", []),
]

# Global tech hubs under the 1,000,000 cut that career boards list often (GeoNames names).
GLOBAL_HUBS: list[tuple[str, str, str, list[str]]] = [
    ("San Francisco", "US", "San Francisco", ["sf", "san francisco bay area", "bay area", "sf bay area"]),
    ("Seattle", "US", "Seattle", ["greater seattle"]),
    ("Austin", "US", "Austin", []),
    ("Boston", "US", "Boston", ["greater boston"]),
    ("Cambridge", "US", "Cambridge", []),
    ("Denver", "US", "Denver", []),
    ("Boulder", "US", "Boulder", []),
    ("Washington", "US", "Washington", ["washington dc", "washington d.c.", "district of columbia"]),
    ("Atlanta", "US", "Atlanta", []),
    ("Miami", "US", "Miami", []),
    ("Portland", "US", "Portland", []),
    ("Pittsburgh", "US", "Pittsburgh", []),
    ("Raleigh", "US", "Raleigh", ["research triangle"]),
    ("Salt Lake City", "US", "Salt Lake City", []),
    ("Nashville", "US", "Nashville", []),
    ("Minneapolis", "US", "Minneapolis", []),
    ("Detroit", "US", "Detroit", []),
    ("Baltimore", "US", "Baltimore", []),
    ("Palo Alto", "US", "Palo Alto", []),
    ("Mountain View", "US", "Mountain View", []),
    ("Sunnyvale", "US", "Sunnyvale", []),
    ("Santa Clara", "US", "Santa Clara", []),
    ("Menlo Park", "US", "Menlo Park", []),
    ("Redwood City", "US", "Redwood City", []),
    ("Oakland", "US", "Oakland", []),
    ("San Mateo", "US", "San Mateo", []),
    ("Cupertino", "US", "Cupertino", []),
    ("Irvine", "US", "Irvine", []),
    ("Bellevue", "US", "Bellevue", []),
    ("Redmond", "US", "Redmond", []),
    ("Vancouver", "CA", "Vancouver", []),
    ("Ottawa", "CA", "Ottawa", []),
    ("Waterloo", "CA", "Waterloo", ["kitchener-waterloo"]),
    ("Amsterdam", "NL", "Amsterdam", []),
    ("Rotterdam", "NL", "Rotterdam", []),
    ("Utrecht", "NL", "Utrecht", []),
    ("Eindhoven", "NL", "Eindhoven", []),
    ("Dublin", "IE", "Dublin", []),
    ("Cork", "IE", "Cork", []),
    ("Edinburgh", "GB", "Edinburgh", []),
    ("Cambridge", "GB", "Cambridge", []),
    ("Oxford", "GB", "Oxford", []),
    ("Bristol", "GB", "Bristol", []),
    ("Manchester", "GB", "Manchester", []),
    ("Belfast", "GB", "Belfast", []),
    ("Zurich", "CH", "Zürich", ["zurich", "zuerich"]),
    ("Geneva", "CH", "Geneva", ["geneve"]),
    ("Lausanne", "CH", "Lausanne", []),
    ("Copenhagen", "DK", "Copenhagen", ["kobenhavn"]),
    ("Stockholm", "SE", "Stockholm", []),
    ("Gothenburg", "SE", "Gothenburg", ["goteborg"]),
    ("Oslo", "NO", "Oslo", []),
    ("Helsinki", "FI", "Helsinki", []),
    ("Tallinn", "EE", "Tallinn", []),
    ("Lisbon", "PT", "Lisbon", ["lisboa"]),
    ("Porto", "PT", "Porto", []),
    ("Frankfurt", "DE", "Frankfurt am Main", ["frankfurt"]),
    ("Stuttgart", "DE", "Stuttgart", []),
    ("Dusseldorf", "DE", "Düsseldorf", ["dusseldorf", "duesseldorf"]),
    ("Krakow", "PL", "Kraków", ["krakow", "cracow"]),
    ("Wroclaw", "PL", "Wrocław", ["wroclaw"]),
    ("Gdansk", "PL", "Gdańsk", ["gdansk"]),
    ("Vilnius", "LT", "Vilnius", []),
    ("Riga", "LV", "Riga", []),
    ("Cluj-Napoca", "RO", "Cluj-Napoca", ["cluj"]),
    ("Brno", "CZ", "Brno", []),
    ("Valencia", "ES", "Valencia", []),
    ("Luxembourg", "LU", "Luxembourg", []),
    ("Brussels", "BE", "Brussels", ["bruxelles"]),
    ("Tel Aviv", "IL", "Tel Aviv", ["tel aviv-yafo", "tel-aviv"]),
    ("Haifa", "IL", "Haifa", []),
    ("Abu Dhabi", "AE", "Abu Dhabi", []),
    ("Doha", "QA", "Doha", []),
    ("Auckland", "NZ", "Auckland", []),
    ("Wellington", "NZ", "Wellington", []),
    ("Canberra", "AU", "Canberra", []),
    ("Colombo", "LK", "Colombo", []),
    ("Kathmandu", "NP", "Kathmandu", []),
    ("Taipei", "TW", "Taipei", []),
    ("Shenzhen", "CN", "Shenzhen", []),
    ("Cape Town", "ZA", "Cape Town", []),
    ("Montevideo", "UY", "Montevideo", []),
]

# Extra English names for countries (the GeoNames name is always included).
COUNTRY_ALIASES = {
    "US": ["usa", "united states of america", "u.s.", "america"],
    "GB": ["uk", "england", "scotland", "wales", "great britain", "britain"],
    "AE": ["uae"],
    "KR": ["korea"],
    "RU": ["russian federation"],
    "CZ": ["czech republic"],
    "TR": ["turkey"],
}
# Country names that are also common US-state or given names: never used to reject a city.
SKIP_COUNTRY_NAMES = {"GE", "JO", "TD"}

REMOTE_ALIASES = ["remote", "anywhere", "worldwide", "work from home", "wfh", "fully remote"]


def ascii_fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().strip()


def main(src: Path) -> None:
    countries: dict[str, str] = {}
    for line in (src / "countryInfo.txt").read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split("\t")
        countries[parts[0]] = parts[4]
    admin1: dict[str, str] = {}
    for line in (src / "admin1CodesASCII.txt").read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            admin1[parts[0]] = parts[2] or parts[1]

    rows = []
    for line in (src / "cities15000.txt").read_text(encoding="utf-8").splitlines():
        p = line.split("\t")
        rows.append(
            {
                "geonameId": int(p[0]),
                "name": p[1],
                "ascii": p[2],
                "alt": [a for a in p[3].split(",") if a],
                "lat": round(float(p[4]), 5),
                "lng": round(float(p[5]), 5),
                "fclass": p[6],
                "fcode": p[7],
                "cc": p[8],
                "admin1": p[10],
                "pop": int(p[14] or 0),
            }
        )

    def entry(row: dict, name: str, aliases: list[str]) -> dict:
        names = {name.lower(), row["name"].lower(), row["ascii"].lower(), ascii_fold(name).lower()}
        names |= {a.lower() for a in aliases}
        return {
            "id": row["geonameId"],
            "name": name,
            "country": countries.get(row["cc"], row["cc"]),
            "countryCode": row["cc"],
            "region": admin1.get(f"{row['cc']}.{row['admin1']}", ""),
            "lat": row["lat"],
            "lng": row["lng"],
            "population": row["pop"],
            "aliases": sorted(n for n in names if n and (len(n) >= 4 or n in {"ncr", "goa", "nyc"})),
        }

    chosen: dict[int, dict] = {}
    taken_names: set[tuple[str, str]] = set()
    curated_alias_keys: set[tuple[str, str]] = set()
    for display, cc, lookup, extra in [*CURATED, *GLOBAL_HUBS]:
        key = lookup.lower()
        candidates = [
            r for r in rows
            if r["cc"] == cc and r["fclass"] == "P"
            and (r["name"].lower() == key or r["ascii"].lower() == key
                 or key in (a.lower() for a in r["alt"]))
        ]
        if not candidates:
            raise SystemExit(f"curated city not found in GeoNames: {display} ({lookup}, {cc})")
        best = max(candidates, key=lambda r: (r["name"].lower() == key or r["ascii"].lower() == key, r["pop"]))
        chosen[best["geonameId"]] = entry(best, display, extra)
        taken_names.add((display.lower(), cc))
        for a in chosen[best["geonameId"]]["aliases"]:
            curated_alias_keys.add((a, cc))

    for r in sorted(rows, key=lambda r: -r["pop"]):
        if r["fclass"] != "P" or r["fcode"] == "PPLX" or r["geonameId"] in chosen:
            continue
        threshold = INDIA_MIN if r["cc"] == "IN" else WORLD_MIN
        if r["pop"] < threshold:
            continue
        name = r["name"]
        key = (name.lower(), r["cc"])
        # Same name in the same country, or a place a curated city already covers by alias
        # (New Delhi → Delhi, Navi Mumbai → Mumbai).
        if key in taken_names or key in curated_alias_keys or (r["ascii"].lower(), r["cc"]) in curated_alias_keys:
            continue
        chosen[r["geonameId"]] = entry(r, name, [])
        taken_names.add(key)

    cities = sorted(chosen.values(), key=lambda c: (c["country"], c["name"]))
    country_names = {
        cc: sorted({name.lower(), *COUNTRY_ALIASES.get(cc, [])})
        for cc, name in countries.items()
        if cc not in SKIP_COUNTRY_NAMES
    }
    data = {
        "source": {
            "name": "GeoNames",
            "url": "https://download.geonames.org/export/dump/",
            "files": ["cities15000.txt", "admin1CodesASCII.txt", "countryInfo.txt"],
            "license": "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
            "built": date.today().isoformat(),
            "builder": "scripts/build-locations.py",
            "selection": f"population >= {WORLD_MIN:,} worldwide, India >= {INDIA_MIN:,}, plus curated cities and global tech hubs",
        },
        "remote": "Remote",
        "remoteAliases": REMOTE_ALIASES,
        "countries": country_names,
        "cities": cities,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(cities)} cities in {len({c['countryCode'] for c in cities})} countries → {OUT}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "."))
