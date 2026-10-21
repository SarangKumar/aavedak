"""Build / refresh the careers-page registry (app/discovery/data/careers_pages.json).

Each candidate in `careers_candidates.txt` names a company and one or more URLs of its own
careers page. Each URL is fetched once (identified crawler User-Agent, robots.txt
respected); the first one that answers HTTP 200 after redirects with an HTML page that
looks like a careers page is kept. Dead, blocked (401/403/429), robots-disallowed or
soft-404 pages are dropped and listed in the report, so the registry only holds pages
that were live when verified. Nothing is guessed: a candidate with no working URL is left
out.

Usage (from apps/api):
  .venv/bin/python scripts/verify_careers_pages.py
  .venv/bin/python scripts/verify_careers_pages.py --workers 24 --report /tmp/careers-report.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.discovery.jobs.careers_crawl import CRAWLER_UA, ROBOTS_AGENT, registrable_domain  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "app" / "discovery" / "data"
CANDIDATES = DATA / "careers_candidates.txt"
OUT = DATA / "careers_pages.json"
FOCUS = {"in": "india", "io": "india_office", "gl": "global"}

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_CAREERS_WORDS = re.compile(
    r"career|job|join|work(?:ing)?[-_ ]?(?:with|at|for)|opportunit|vacanc|talent|hiring|openings|life[-_ ]?at|recruit",
    re.I,
)
_SOFT_404 = re.compile(r"\b404\b|not found|page (?:does not|doesn't) exist|no longer available", re.I)


def parse_candidates(path: Path) -> list[dict]:
    out, seen = [], set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 4:
            raise SystemExit(f"Bad candidate line: {line}")
        name, focus, tier, urls = parts
        key = re.sub(r"[^a-z0-9]", "", name.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append({"name": name, "focus": FOCUS[focus], "tier": int(tier), "urls": urls.split()})
    return out


_robots_cache: dict[str, RobotFileParser | None] = {}


def robots_allows(client: httpx.Client, url: str) -> bool:
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in _robots_cache:
        parser: RobotFileParser | None = None
        try:
            res = client.get(f"{origin}/robots.txt", timeout=10)
            if res.status_code < 400:
                parser = RobotFileParser()
                parser.parse(res.text.splitlines())
        except httpx.HTTPError:
            parser = None
        _robots_cache[origin] = parser
    parser = _robots_cache[origin]
    return True if parser is None else parser.can_fetch(ROBOTS_AGENT, url)


def check_url(client: httpx.Client, url: str) -> dict:
    try:
        res = client.get(url)
    except httpx.HTTPError as exc:
        return {"ok": False, "url": url, "reason": f"request failed: {exc.__class__.__name__}"}
    final = str(res.url)
    if res.status_code != 200:
        return {"ok": False, "url": url, "final": final, "reason": f"HTTP {res.status_code}"}
    ctype = res.headers.get("content-type", "")
    if "html" not in ctype:
        return {"ok": False, "url": url, "final": final, "reason": f"not HTML ({ctype[:40]})"}
    html = res.text
    match = _TITLE_RE.search(html)
    title = re.sub(r"\s+", " ", match.group(1)).strip()[:200] if match else ""
    if _SOFT_404.search(title):
        return {"ok": False, "url": url, "final": final, "reason": f"soft 404 ({title[:60]})"}
    parsed = urlparse(final)
    looks = _CAREERS_WORDS.search(parsed.netloc + parsed.path) or _CAREERS_WORDS.search(title)
    if not looks:
        # Redirected to a home page (or a page that never mentions careers in its title/URL).
        return {"ok": False, "url": url, "final": final, "reason": f"not a careers page ({title[:60]})"}
    if not robots_allows(client, final):
        return {"ok": False, "url": url, "final": final, "reason": "robots.txt disallows"}
    return {"ok": True, "url": url, "final": final, "title": title, "bytes": len(html)}


def verify(candidate: dict, delay: float) -> dict:
    attempts = []
    with httpx.Client(
        timeout=httpx.Timeout(15.0, connect=8.0),
        headers={"User-Agent": CRAWLER_UA, "Accept": "text/html,application/xhtml+xml"},
        follow_redirects=True,
    ) as client:
        for url in candidate["urls"]:
            result = check_url(client, url)
            attempts.append(result)
            if result["ok"]:
                return {**candidate, "result": result, "attempts": attempts}
            time.sleep(delay)
    return {**candidate, "result": None, "attempts": attempts}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", type=Path, default=CANDIDATES)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--report", type=Path, default=None)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--delay", type=float, default=0.3)
    args = ap.parse_args()

    candidates = parse_candidates(args.candidates)
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda c: verify(c, args.delay), candidates))

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    registry, seen_urls, dead = [], set(), []
    for r in results:
        res = r["result"]
        if not res:
            dead.append({"name": r["name"], "attempts": r["attempts"]})
            continue
        final = res["final"].split("#")[0]
        # Keep the company's own link when it redirects to another site (a hosted board,
        # a parent brand): the crawler follows the redirect on every read anyway.
        if registrable_domain(final) != registrable_domain(res["url"]):
            final = res["url"]
        key = final.rstrip("/").lower()
        if key in seen_urls:  # two names for one page (e.g. a brand and its parent)
            dead.append({"name": r["name"], "attempts": [{"reason": f"duplicate of {final}"}]})
            continue
        seen_urls.add(key)
        registry.append(
            {
                "name": r["name"],
                "careersUrl": final,
                "domain": registrable_domain(final),
                "countryFocus": r["focus"],
                "tier": r["tier"],
                "verifiedAt": now,
            }
        )
    registry.sort(key=lambda row: row["name"].lower())
    args.out.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.report:
        args.report.write_text(json.dumps({"dead": dead}, indent=2), encoding="utf-8")
    print(
        f"{len(candidates)} candidates → {len(registry)} live careers pages, {len(dead)} dropped "
        f"in {time.monotonic() - started:.0f}s → {args.out}"
    )


if __name__ == "__main__":
    main()
