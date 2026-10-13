"""Canonical job locations ("City, Country" or "Remote"), shared with the web app.

Both apps read the one file `data/locations/canonical-locations.json` at the repo root
(GeoNames-built by `scripts/build-locations.py`). Same rules as the web `canonicalLocation`:
exactly one known city (any alias) → that city; an alias several cities share resolves to the
one in a country the text names, else the most populous if at least twice the next; only a
remote phrase → "Remote"; several cities, unknown places, a bare country, or a city with a
different country → None. If the file is missing (e.g. a deploy bundle without the repo
root), nothing is canonicalized and raw text is kept.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

from app.discovery.data_path import resolve_data_file

log = logging.getLogger(__name__)

DATA_PATH = Path(__file__).resolve().parents[5] / "data" / "locations" / "canonical-locations.json"


@lru_cache(maxsize=1)
def _data() -> dict:
    path = resolve_data_file("CANONICAL_LOCATIONS_PATH", "data/locations/canonical-locations.json")
    if path is not None:
        return json.loads(path.read_text(encoding="utf-8"))
    log.warning("canonical locations file not found; locations stay as raw text")
    return {"remote": "Remote", "remoteAliases": [], "countries": {}, "cities": []}


def _word(phrase: str) -> re.Pattern[str]:
    escaped = re.escape(phrase).replace(r"\ ", r"\s+")
    return re.compile(rf"(?<![^\W_]){escaped}(?![^\W_])", re.I)


def _label(city: dict) -> str:
    return f"{city['name']}, {city['country']}"


@lru_cache(maxsize=1)
def _patterns():
    data = _data()
    by_alias: dict[str, list[dict]] = {}
    for city in data["cities"]:
        for alias in city["aliases"]:
            group = by_alias.setdefault(alias, [])
            if city not in group:
                group.append(city)
    cities = [
        (_word(alias), sorted(group, key=lambda c: -c["population"]))
        for alias, group in sorted(by_alias.items(), key=lambda item: -len(item[0]))
    ]
    countries = [(code, [_word(a) for a in names]) for code, names in data["countries"].items()]
    remote = [_word(a) for a in data["remoteAliases"]]
    canonical = {_label(c).lower(): _label(c) for c in data["cities"]}
    canonical[data["remote"].lower()] = data["remote"]
    return cities, countries, remote, canonical


def _resolve(group: list[dict], named: list[str]) -> dict | None:
    if len(group) == 1:
        return group[0]
    in_named = [c for c in group if c["countryCode"] in named]
    if len(in_named) == 1:
        return in_named[0]
    first, second = group[0], group[1]
    return first if first["population"] >= 2 * second["population"] else None


def canonical_location(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    cities, countries, remote, canonical = _patterns()
    if text.lower() in canonical:
        return canonical[text.lower()]
    work = f" {re.sub(r'\((?:hybrid|on-?site|remote)\)', ' ', text.lower())} "
    named = [code for code, rxs in countries if any(r.search(work) for r in rxs)]
    found: dict[str, dict] = {}
    for rx, group in cities:
        if rx.search(work):
            city = _resolve(group, named)
            if city:
                found[_label(city)] = city
            work = rx.sub(lambda m: " " * len(m.group(0)), work)
    if len(found) == 1:
        label, city = next(iter(found.items()))
        return label if not named or city["countryCode"] in named else None
    if found:
        return None
    return remote_or_none(text, remote)


def remote_or_none(text: str, remote=None) -> str | None:
    patterns = remote if remote is not None else _patterns()[2]
    return _data()["remote"] if any(r.search(text) for r in patterns) else None
