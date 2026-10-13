"""Build / refresh the career-source seed (app/discovery/data/career_sources.json).

For each candidate company name, try likely board tokens on each public ATS API and keep
boards that currently list at least one India-eligible posting (India location or remote
open to India). The count of junior titles in discovery's role scope is recorded too; the scan filters roles before storing, so
boards without matching roles today cost a request, not database rows.
Only public posting APIs are called; nothing is scraped.

Usage (from apps/api):
  .venv/bin/python scripts/verify_career_sources.py app/discovery/data/seed_candidates.txt
  .venv/bin/python scripts/verify_career_sources.py candidates.txt --out /tmp/seed.json --workers 16

Candidate file: one `Company Name|sector` per line (sector: software | core | mixed).
Existing seed entries are kept; new verified boards are merged in.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.discovery.jobs import filters  # noqa: E402
from app.discovery.jobs.models import SourceTarget  # noqa: E402
from app.discovery.jobs.providers import BOARD_URLS  # noqa: E402
from app.discovery.jobs.providers import ashby, greenhouse, lever, smartrecruiters, workable  # noqa: E402

SEED = Path(__file__).resolve().parent.parent / "app" / "discovery" / "data" / "career_sources.json"
LIGHT_URLS = {
    "greenhouse": ("https://boards-api.greenhouse.io/v1/boards/{t}/jobs", {}),
    "lever": ("https://api.lever.co/v0/postings/{t}", {"mode": "json"}),
    "ashby": ("https://api.ashbyhq.com/posting-api/job-board/{t}", {}),
    "workable": ("https://apply.workable.com/api/v1/widget/accounts/{t}", {}),
    "smartrecruiters": ("https://api.smartrecruiters.com/v1/companies/{t}/postings", {"limit": 100, "country": "in"}),
}
PARSERS = {
    "greenhouse": greenhouse.parse,
    "lever": lever.parse,
    "ashby": ashby.parse,
    "workable": workable.parse,
    "smartrecruiters": smartrecruiters.parse_list,
}


# Many boards use the company name plus a suffix (e.g. Headout → "headoutcareers").
TOKEN_SUFFIXES = ("careers", "jobs", "hq", "inc", "india", "tech")


def token_variants(name: str) -> list[str]:
    """Likely board tokens, most likely first: "acmecorp", "acme-corp", "acme", then the joined
    name with common suffixes ("acmecorpcareers", …)."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", name) if w]
    if not words:
        return []
    joined = "".join(words).lower()
    candidates = [joined, "-".join(words).lower(), words[0].lower() if len(words) > 1 else ""]
    candidates += [f"{joined}{suffix}" for suffix in TOKEN_SUFFIXES]
    out: list[str] = []
    for token in candidates:
        if token and token not in out:
            out.append(token)
    return out


KEEP = "india"  # "india": ≥1 India-eligible posting; "live": any board with ≥1 posting
DELAY = 0.0  # seconds slept before each request (per worker), to stay polite


def check(client: httpx.Client, provider: str, token: str, name: str) -> tuple[int, int, int] | None:
    url, params = LIGHT_URLS[provider]
    if DELAY:
        time.sleep(DELAY)
    try:
        response = client.get(url.format(t=token), params=params)
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    try:
        payload = response.json()
    except ValueError:
        return None
    target = SourceTarget(id="", company_name=name, provider=provider, token=token, careers_url="")
    try:
        postings = PARSERS[provider](payload, target)
    except Exception:  # noqa: BLE001 — unexpected payload shape means "not a board"
        return None
    india = [p for p in postings if filters.is_india_eligible(p.locations, p.country_code)]
    engineering = [
        p for p in india if filters.is_engineering_title(p.title) and not filters.is_senior_title(p.title)
    ]
    return len(india), len(engineering), len(postings)


def keep(india: int, total: int) -> bool:
    return india > 0 or (KEEP == "live" and total > 0)


def reverify(row: dict, client: httpx.Client) -> dict | None:
    """Re-check an existing seed row on its own token; None when the board is dead/empty."""
    if row["provider"] not in LIGHT_URLS:
        return row  # jsonld / json_feed rows are career pages, not ATS boards
    result = check(client, row["provider"], row["token"], row["name"])
    if result is None or not keep(result[0], result[2]):
        return None
    india, engineering, total = result
    return {**row, "verifiedIndiaPostings": india, "verifiedIndiaEngineering": engineering,
            "verifiedTotalPostings": total}


def verify(entry: tuple[str, str], client: httpx.Client) -> list[dict]:
    name, sector = entry
    found = []
    for provider in LIGHT_URLS:
        for token in token_variants(name):
            result = check(client, provider, token, name)
            if result is None:
                continue
            india, engineering, total = result
            if keep(india, total):
                found.append(
                    {
                        "name": name,
                        "provider": provider,
                        "token": token,
                        "careersUrl": BOARD_URLS[provider].format(token),
                        "sector": sector,
                        "verifiedIndiaPostings": india,
                        "verifiedIndiaEngineering": engineering,
                        "verifiedTotalPostings": total,
                    }
                )
            break  # first token that resolves for this provider wins
    return found


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidates")
    parser.add_argument("--out", default=str(SEED))
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument(
        "--skip-known",
        action="store_true",
        help="Skip candidates already in the output file (a fast run that only looks for new boards).",
    )
    parser.add_argument("--keep", choices=("india", "live"), default="india",
                        help="india: keep boards with India-eligible postings; live: any live board with postings.")
    parser.add_argument("--reverify", action="store_true",
                        help="Re-check existing seed rows too and drop boards that are dead or empty.")
    parser.add_argument("--delay", type=float, default=0.0, help="Seconds slept before each request per worker.")
    args = parser.parse_args()
    global KEEP, DELAY
    KEEP, DELAY = args.keep, args.delay

    entries, seen = [], set()
    for line in Path(args.candidates).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, _, sector = line.partition("|")
        if name.lower() not in seen:
            seen.add(name.lower())
            entries.append((name.strip(), (sector or "software").strip()))

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []
    headers = {"User-Agent": "AavedakSeedVerifier/1.0", "Accept": "application/json"}
    rejected = 0
    if args.reverify and existing:
        with httpx.Client(timeout=httpx.Timeout(60, connect=15), headers=headers, follow_redirects=True) as client:
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                checked = list(pool.map(lambda r: reverify(r, client), existing))
        rejected = sum(1 for r in checked if r is None)
        print(f"re-verified {len(existing)} existing rows, dropped {rejected}", flush=True)
        existing = [r for r in checked if r is not None]
    by_key = {(e["provider"], e["token"].lower()): e for e in existing}
    if args.skip_known:
        known = {e["name"].lower() for e in existing}
        entries = [e for e in entries if e[0].lower() not in known]
        print(f"{len(entries)} candidates not in {out_path.name} yet", flush=True)

    with httpx.Client(timeout=httpx.Timeout(60, connect=15), headers=headers, follow_redirects=True) as client:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for index, found in enumerate(pool.map(lambda e: verify(e, client), entries)):
                for row in found:
                    by_key.setdefault((row["provider"], row["token"].lower()), row)
                if index % 50 == 0:
                    print(f"{index}/{len(entries)} checked, {len(by_key)} boards", flush=True)

    # One board per company name: prefer the board with the most India-eligible postings.
    by_name: dict[str, dict] = {}
    for row in by_key.values():
        key = re.sub(r"[^a-z0-9]", "", row["name"].lower())
        best = by_name.get(key)
        if best is None or (row.get("verifiedIndiaPostings", 0), row.get("verifiedTotalPostings", 0)) > (
            best.get("verifiedIndiaPostings", 0), best.get("verifiedTotalPostings", 0)):
            by_name[key] = row
    merged = sorted(by_name.values(), key=lambda r: (r["name"].lower(), r["provider"]))
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(merged)} boards to {out_path}")


if __name__ == "__main__":
    main()
