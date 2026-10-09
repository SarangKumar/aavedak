"""Build / refresh the career-source seed (app/discovery/data/career_sources.json).

For each candidate company name, try likely board tokens on each public ATS API and keep
boards that currently list at least one India posting (India hiring presence). The count of
India junior-engineering titles is recorded too; the scan filters roles before storing, so
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


def token_variants(name: str) -> list[str]:
    words = [w for w in re.split(r"[^A-Za-z0-9]+", name) if w]
    out: list[str] = []
    for token in ("".join(words).lower(), "-".join(words).lower(), words[0].lower() if len(words) > 1 else ""):
        if token and token not in out:
            out.append(token)
    return out


def check(client: httpx.Client, provider: str, token: str, name: str) -> tuple[int, int] | None:
    url, params = LIGHT_URLS[provider]
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
    india = [p for p in postings if filters.is_india(p.locations, p.country_code)]
    engineering = [
        p for p in india if filters.is_engineering_title(p.title) and not filters.is_senior_title(p.title)
    ]
    return len(india), len(engineering)


def verify(entry: tuple[str, str], client: httpx.Client) -> list[dict]:
    name, sector = entry
    found = []
    for provider in LIGHT_URLS:
        for token in token_variants(name):
            result = check(client, provider, token, name)
            if result is None:
                continue
            india, engineering = result
            if india > 0:
                found.append(
                    {
                        "name": name,
                        "provider": provider,
                        "token": token,
                        "careersUrl": BOARD_URLS[provider].format(token),
                        "sector": sector,
                        "verifiedIndiaPostings": india,
                        "verifiedIndiaEngineering": engineering,
                    }
                )
            break  # first token that resolves for this provider wins
    return found


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidates")
    parser.add_argument("--out", default=str(SEED))
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()

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
    by_key = {(e["provider"], e["token"].lower()): e for e in existing}

    headers = {"User-Agent": "AavedakSeedVerifier/1.0", "Accept": "application/json"}
    with httpx.Client(timeout=httpx.Timeout(60, connect=15), headers=headers, follow_redirects=True) as client:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for index, found in enumerate(pool.map(lambda e: verify(e, client), entries)):
                for row in found:
                    by_key.setdefault((row["provider"], row["token"].lower()), row)
                if index % 50 == 0:
                    print(f"{index}/{len(entries)} checked, {len(by_key)} boards", flush=True)

    merged = sorted(by_key.values(), key=lambda r: (r["name"].lower(), r["provider"]))
    out_path.write_text(json.dumps(merged, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(merged)} boards to {out_path}")


if __name__ == "__main__":
    main()
