"""Canonical job locations ("City, Country" or "Remote"), shared with the web app.

`canonical_locations.json` is a copy of `apps/web/lib/locations/canonical-locations.json`
(test_canonical_locations_match_web keeps them equal). Same rules as the web
`canonicalLocation`: exactly one known city (any alias) → that city; only a remote phrase →
"Remote"; several cities, unknown places, a bare country, or a city with a different
country → None.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

DATA_PATH = Path(__file__).with_name("canonical_locations.json")


@lru_cache(maxsize=1)
def _data() -> dict:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def _word(phrase: str) -> re.Pattern[str]:
    escaped = re.escape(phrase).replace(r"\ ", r"\s+")
    return re.compile(rf"(?<![^\W_]){escaped}(?![^\W_])", re.I)


@lru_cache(maxsize=1)
def _patterns():
    data = _data()
    aliases = sorted(
        ((alias, city) for city in data["cities"] for alias in city["aliases"]),
        key=lambda item: -len(item[0]),
    )
    cities = [(_word(alias), f"{city['name']}, {city['country']}", city["country"]) for alias, city in aliases]
    countries = [(country, [_word(a) for a in names]) for country, names in data["countries"].items()]
    remote = [_word(a) for a in data["remoteAliases"]]
    canonical = {f"{c['name']}, {c['country']}".lower(): f"{c['name']}, {c['country']}" for c in data["cities"]}
    canonical[data["remote"].lower()] = data["remote"]
    return cities, countries, remote, canonical


def canonical_location(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    cities, countries, remote, canonical = _patterns()
    if text.lower() in canonical:
        return canonical[text.lower()]
    work = f" {re.sub(r'\((?:hybrid|on-?site|remote)\)', ' ', text.lower())} "
    found: dict[str, str] = {}
    for rx, label, country in cities:
        if rx.search(work):
            found[label] = country
            work = rx.sub(lambda m: " " * len(m.group(0)), work)
    if len(found) == 1:
        label, country = next(iter(found.items()))
        named = [c for c, rxs in countries if any(r.search(work) for r in rxs)]
        if named and country not in named:
            return None
        return label
    if found:
        return None
    return _data()["remote"] if any(r.search(work) for r in remote) else None
