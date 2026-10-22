"""Grow the board registry from public ATS datasets, instead of guessing tokens from names.

`verify_career_sources.py` starts from a hand-typed company name and guesses likely board
tokens, so a company whose token we cannot guess stays invisible. These datasets already hold
the (platform, token) pair, so every row can be checked with **one** request against the same
public API the scan uses.

Datasets (both CC BY 4.0, credited in `app/discovery/data/DATASETS.md`):

* **LastRound AI — ATS Company Directory** (9,935 companies → vendor + board slug + name).
  `ats-directory/lastroundai-ats-company-directory-2026-08.csv`
* **Latmay — ATS Career Page URLs** (69,638 canonical board URLs + platform, no names).
  `ats_career_page_urls.csv`

Neither is trusted as truth: a row only reaches the registry after `board_probe.probe_board`
confirms the board answers 200 with postings we can parse, and `--keep india` (the default)
additionally requires at least one posting that is India-eligible today — the same bar
`verify_career_sources.py` applies. Boards are stored with their provenance
(`origin = "dataset"`, `dataset = "<id>"`) so an admin can tell them from verified seeds.

Usage:

    cd apps/api
    # What the datasets would add, without touching the network:
    .venv/bin/python scripts/import_ats_datasets.py --lastroundai <csv> --hf <csv> --plan

    # Measure the hit rate on a random sample first (recommended before a full run):
    .venv/bin/python scripts/import_ats_datasets.py --lastroundai <csv> --hf <csv> \
        --sample 400 --report /tmp/sample.json --dry-run

    # Full run, appending what passes to app/discovery/data/career_sources.json:
    .venv/bin/python scripts/import_ats_datasets.py --lastroundai <csv> --hf <csv> \
        --workers 12 --delay 0.2 --report /tmp/import.json

Only platforms with a one-request probe are checked (`board_probe.PROBE_SPECS`: Greenhouse,
Lever, Ashby, Workable, SmartRecruiters, Rippling, Breezy). Workday, Teamtailor and Personio
URLs are counted and skipped, because confirming one costs several requests.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.discovery.jobs.board_probe import PROBE_SPECS, probe_board  # noqa: E402
from app.discovery.jobs.providers import BOARD_URLS, detect_source  # noqa: E402

SEED_PATH = Path(__file__).resolve().parents[1] / "app" / "discovery" / "data" / "career_sources.json"
# Dataset ids recorded on every row they contribute.
LASTROUND_ID = "lastroundai-ats-company-directory-2026-08"
LATMAY_ID = "latmay-ats-career-page-urls"
# The CSV's vendor column → our provider name.
VENDORS = {"greenhouse": "greenhouse", "lever": "lever", "ashby": "ashby"}
USER_AGENT = "AavedakJobsBot/1.0 (+https://aavedak.vercel.app)"


@dataclass
class Candidate:
    provider: str
    token: str
    name: str
    dataset: str


def _name_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def plausible_token(token: str) -> bool:
    """Reject board tokens that cannot be a company: a single character, or digits only.
    Latmay carries a few test boards ("1", "123") whose postings parse but whose name would
    read as nonsense in the public company list."""
    token = (token or "").strip()
    return len(token) >= 2 and any(c.isalpha() for c in token)


def pretty_token(token: str) -> str:
    """Display name for a board the dataset gave no name for: the token, spaced and capitalised
    ("acme-corp" → "Acme Corp"). The board API does not report a company name, so this is a
    placeholder an admin can correct — it is never shown as a verified company name."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", token) if w]
    return " ".join(w if w.isupper() else w.capitalize() for w in words) or token


def read_lastroundai(path: Path) -> list[Candidate]:
    out: list[Candidate] = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            provider = VENDORS.get((row.get("ats_vendor") or "").strip().lower())
            token = (row.get("board_slug") or "").strip()
            name = (row.get("company_name") or "").strip()
            if not provider or not token or not plausible_token(token):
                continue
            out.append(Candidate(provider, token.lower(), name or pretty_token(token), LASTROUND_ID))
    return out


def read_latmay(path: Path) -> tuple[list[Candidate], Counter]:
    """Board URLs → (provider, token) with our own `detect_source`, so the dataset's platform
    names never decide anything. Rows we cannot place are counted, not guessed."""
    out: list[Candidate] = []
    skipped: Counter = Counter()
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            url = (row.get("canonical_url") or "").strip()
            platform = (row.get("ats_platform") or "").strip() or "unknown"
            if not url:
                continue
            try:
                detected = detect_source(url)
            except ValueError:
                skipped[f"{platform} (unreadable url)"] += 1
                continue
            if detected.provider not in PROBE_SPECS:
                skipped[f"{platform} → {detected.provider}"] += 1
                continue
            if not plausible_token(detected.token):
                skipped[f"{platform} (implausible token)"] += 1
                continue
            out.append(Candidate(detected.provider, detected.token, pretty_token(detected.token), LATMAY_ID))
    return out, skipped


def merge(groups: Iterable[list[Candidate]]) -> dict[tuple[str, str], Candidate]:
    """One entry per (provider, token). A row that carries a real company name wins over one
    whose name was derived from the token."""
    best: dict[tuple[str, str], Candidate] = {}
    for group in groups:
        for candidate in group:
            key = (candidate.provider, candidate.token.lower())
            current = best.get(key)
            if current is None:
                best[key] = candidate
            elif current.dataset == LATMAY_ID and candidate.dataset == LASTROUND_ID:
                best[key] = candidate
    return best


def drop_known(
    candidates: dict[tuple[str, str], Candidate], seed: list[dict[str, Any]]
) -> tuple[dict[tuple[str, str], Candidate], Counter]:
    """Remove what the registry already covers: the same (provider, token), or the same company
    name on any board (the same rule `registry.import_seed` applies when syncing)."""
    keys = {(row["provider"], str(row["token"]).lower()) for row in seed}
    names = {_name_key(row["name"]) for row in seed}
    dropped: Counter = Counter()
    kept: dict[tuple[str, str], Candidate] = {}
    for key, candidate in candidates.items():
        if (key[0], key[1].lower()) in keys:
            dropped["already in registry (provider, token)"] += 1
            continue
        if candidate.dataset == LASTROUND_ID and _name_key(candidate.name) in names:
            dropped["company already in registry under another board"] += 1
            continue
        kept[key] = candidate
    return kept, dropped


class Progress:
    """One line of progress per `every` probes; threads share it under a lock."""

    def __init__(self, total: int, every: int = 250) -> None:
        self.total, self.every = total, every
        self.done = self.live = self.india = 0
        self.started = time.monotonic()
        self._lock = threading.Lock()

    def record(self, *, live: bool, india: bool) -> None:
        with self._lock:
            self.done += 1
            self.live += int(live)
            self.india += int(india)
            if self.done % self.every == 0 or self.done == self.total:
                rate = self.done / max(0.001, time.monotonic() - self.started)
                left = (self.total - self.done) / max(0.001, rate)
                print(
                    f"{self.done}/{self.total} probed · {self.live} live · {self.india} with India "
                    f"postings · {rate:.1f}/s · ~{left / 60:.0f} min left",
                    flush=True,
                )


def probe_all(
    candidates: list[Candidate], *, workers: int, delay: float, keep: str, timeout: float
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], Counter]:
    """One request per candidate.

    Returns (registry entries that pass `keep`, every live board, counts). The second list is
    the cold pool: boards that answered with postings but none in India today. Keeping it means
    a later change of mind costs no requests.
    """
    stats: Counter = Counter()
    progress = Progress(len(candidates))
    results: list[dict[str, Any]] = []
    live_rows: list[dict[str, Any]] = []
    lock = threading.Lock()

    # One client per worker thread, so 40k probes reuse connections instead of shaking hands
    # 40k times (faster, and gentler on the APIs).
    local = threading.local()

    def client_for_thread() -> httpx.Client:
        client = getattr(local, "client", None)
        if client is None:
            client = httpx.Client(
                timeout=timeout, headers={"User-Agent": USER_AGENT}, follow_redirects=True
            )
            local.client = client
        return client

    def run(candidate: Candidate) -> None:
        if delay:
            time.sleep(delay)
        found = probe_board(
            client_for_thread(), candidate.provider, candidate.token, candidate.name
        )
        india = bool(found and found.india)
        progress.record(live=bool(found), india=india)
        with lock:
            if found is None:
                stats["dead or unparsable"] += 1
                return
            stats["live"] += 1
            stats[f"live: {candidate.provider}"] += 1
            live_rows.append(
                {
                    "name": candidate.name,
                    "provider": candidate.provider,
                    "token": candidate.token,
                    "careersUrl": BOARD_URLS[candidate.provider].format(candidate.token),
                    "dataset": candidate.dataset,
                    "indiaPostings": found.india,
                    "indiaEngineering": found.engineering,
                    "totalPostings": found.total,
                }
            )
            if found.india:
                stats["live with India postings"] += 1
            if found.engineering:
                stats["live with India junior tech postings"] += 1
            if keep == "india" and not found.india:
                stats["skipped: no India posting today"] += 1
                return
            results.append(
                {
                    "name": candidate.name,
                    "provider": candidate.provider,
                    "token": candidate.token,
                    "careersUrl": BOARD_URLS[candidate.provider].format(candidate.token),
                    "sector": "software",
                    "origin": "dataset",
                    "dataset": candidate.dataset,
                    "verifiedIndiaPostings": found.india,
                    "verifiedIndiaEngineering": found.engineering,
                    "verifiedTotalPostings": found.total,
                }
            )

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(run, candidates))
    live_rows.sort(key=lambda row: (-row["indiaPostings"], _name_key(row["name"])))
    return results, live_rows, stats


def entries_from_live(path: Path, *, keep: str) -> tuple[list[Candidate], list[dict[str, Any]]]:
    """Re-read a `--live-out` file instead of probing again: the same keep rule, no requests.
    Use it to widen or narrow what was imported from a run that already happened."""
    rows = json.loads(path.read_text(encoding="utf-8"))
    candidates: list[Candidate] = []
    entries: list[dict[str, Any]] = []
    for row in rows:
        if keep == "india" and not row.get("indiaPostings"):
            continue
        if not plausible_token(row["token"]):
            continue
        candidates.append(Candidate(row["provider"], row["token"], row["name"], row["dataset"]))
        entries.append(
            {
                "name": row["name"],
                "provider": row["provider"],
                "token": row["token"],
                "careersUrl": row["careersUrl"],
                "sector": "software",
                "origin": "dataset",
                "dataset": row["dataset"],
                "verifiedIndiaPostings": row["indiaPostings"],
                "verifiedIndiaEngineering": row["indiaEngineering"],
                "verifiedTotalPostings": row["totalPostings"],
            }
        )
    return candidates, entries


def write_seed(path: Path, seed: list[dict[str, Any]], additions: list[dict[str, Any]]) -> None:
    """Append and sort by company name, the shape the file already has. Existing rows are never
    rewritten, so a re-run only ever adds."""
    merged = seed + additions
    merged.sort(key=lambda row: (_name_key(row["name"]), row["provider"], row["token"]))
    path.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lastroundai", type=Path, help="LastRound AI ATS directory CSV")
    parser.add_argument("--hf", type=Path, help="Latmay ATS career page URLs CSV")
    parser.add_argument("--out", type=Path, default=SEED_PATH, help="career_sources.json to grow")
    parser.add_argument("--keep", choices=("india", "live"), default="india",
                        help="india: keep boards with an India-eligible posting today (default); live: any live board.")
    parser.add_argument("--plan", action="store_true", help="Count what the datasets add and exit (no network).")
    parser.add_argument("--dry-run", action="store_true", help="Probe, report, but do not write the registry.")
    parser.add_argument("--sample", type=int, default=0, help="Probe this many random candidates instead of all.")
    parser.add_argument("--limit", type=int, default=0, help="Probe at most this many candidates (in order).")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--delay", type=float, default=0.2, help="Seconds slept before each request per worker.")
    parser.add_argument("--timeout", type=float, default=20.0)
    parser.add_argument("--seed-random", type=int, default=7, help="Seed for --sample, so a sample is repeatable.")
    parser.add_argument("--report", type=Path, help="Write the counts (and sample estimate) here as JSON.")
    parser.add_argument("--from-live", type=Path,
                        help="Re-apply --keep to a saved --live-out file instead of probing again (no requests).")
    parser.add_argument("--live-out", type=Path,
                        help="Write every live board found (including those with no India posting today) here.")
    args = parser.parse_args()

    if not args.lastroundai and not args.hf and not args.from_live:
        parser.error("Pass --lastroundai and/or --hf, or --from-live")

    if args.from_live:
        seed = json.loads(args.out.read_text(encoding="utf-8"))
        candidates, entries = entries_from_live(args.from_live, keep=args.keep)
        fresh, dropped = drop_known({(c.provider, c.token.lower()): c for c in candidates}, seed)
        additions = [e for e in entries if (e["provider"], e["token"].lower()) in fresh]
        print(f"registry now: {len(seed)} boards")
        print(f"{args.from_live.name}: {len(candidates)} boards pass keep={args.keep}")
        for label, count in dropped.most_common():
            print(f"  dropped: {label}: {count}")
        if args.dry_run:
            print(f"dry run: would add {len(additions)}")
            return 0
        write_seed(args.out, seed, additions)
        print(f"wrote {args.out}: {len(seed)} + {len(additions)} = {len(seed) + len(additions)} boards")
        return 0

    groups: list[list[Candidate]] = []
    sources: dict[str, int] = {}
    latmay_skipped: Counter = Counter()
    if args.lastroundai:
        rows = read_lastroundai(args.lastroundai)
        sources[LASTROUND_ID] = len(rows)
        groups.append(rows)
    if args.hf:
        rows, latmay_skipped = read_latmay(args.hf)
        sources[LATMAY_ID] = len(rows)
        groups.append(rows)

    seed = json.loads(args.out.read_text(encoding="utf-8"))
    candidates = merge(groups)
    fresh, dropped = drop_known(candidates, seed)
    by_provider = Counter(c.provider for c in fresh.values())
    named = sum(1 for c in fresh.values() if c.dataset == LASTROUND_ID)

    print(f"registry now: {len(seed)} boards")
    for dataset, count in sources.items():
        print(f"  {dataset}: {count} readable rows")
    if latmay_skipped:
        print("  platforms skipped (no one-request probe):")
        for label, count in latmay_skipped.most_common(12):
            print(f"    {label}: {count}")
    print(f"union: {len(candidates)} distinct boards → {len(fresh)} not in the registry yet")
    for label, count in dropped.most_common():
        print(f"  dropped: {label}: {count}")
    print(f"  by platform: {dict(by_provider.most_common())}")
    print(f"  with a real company name: {named} (the rest get a placeholder from the token)")

    report: dict[str, Any] = {
        "registryBefore": len(seed),
        "datasets": sources,
        "skippedPlatforms": dict(latmay_skipped),
        "union": len(candidates),
        "fresh": len(fresh),
        "dropped": dict(dropped),
        "byProvider": dict(by_provider),
        "keep": args.keep,
    }

    if args.plan:
        if args.report:
            args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return 0

    order = sorted(fresh.values(), key=lambda c: (c.provider, c.token))
    if args.sample:
        random.Random(args.seed_random).shuffle(order)
        order = order[: args.sample]
    elif args.limit:
        order = order[: args.limit]

    print(f"probing {len(order)} boards with {args.workers} workers, {args.delay}s delay each…", flush=True)
    additions, live_rows, stats = probe_all(
        order, workers=args.workers, delay=args.delay, keep=args.keep, timeout=args.timeout
    )
    if args.live_out:
        args.live_out.write_text(json.dumps(live_rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {args.live_out}: {len(live_rows)} live boards")
    print("probe results:")
    for label, count in stats.most_common():
        print(f"  {label}: {count}")
    report["probed"] = len(order)
    report["probeStats"] = dict(stats)
    report["additions"] = len(additions)
    if order and args.sample:
        # Extrapolation, stated as such: a uniform random sample of the fresh candidates.
        rate = len(additions) / len(order)
        report["sampleEstimateForAll"] = round(rate * len(fresh))
        print(
            f"sample keep rate {rate:.1%} → a full run would add about "
            f"{report['sampleEstimateForAll']} boards of {len(fresh)}"
        )

    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if args.dry_run or args.sample:
        print("dry run: registry not written")
        return 0
    write_seed(args.out, seed, additions)
    print(f"wrote {args.out}: {len(seed)} + {len(additions)} = {len(seed) + len(additions)} boards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
