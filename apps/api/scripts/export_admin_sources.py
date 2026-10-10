"""Copy career sources added on the Admin page into the repo registry
(app/discovery/data/career_sources.json), so a fresh database or "Re-import verified seed list"
keeps pulling jobs from them.

Reads `company_sources` rows with origin 'admin' (enabled only) using DATABASE_URL from
apps/api/.env. The query is read-only. The registry only gains entries: existing ones (matched by
provider + token) are never changed or removed.

Usage (from apps/api):
  .venv/bin/python scripts/export_admin_sources.py --dry-run
  .venv/bin/python scripts/export_admin_sources.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.discovery.jobs.registry import SEED_PATH  # noqa: E402


def merge_sources(
    existing: list[dict[str, Any]], rows: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Registry entries plus admin rows not already listed (same provider + token, case-
    insensitive). Returns (merged list sorted like the verifier output, added entries)."""
    keys = {(e["provider"], e["token"].lower()) for e in existing}
    added: list[dict[str, Any]] = []
    for row in rows:
        provider = str(row.get("provider") or "").strip()
        token = str(row.get("token") or "").strip()
        url = str(row.get("careers_url") or "").strip()
        name = str(row.get("company_name") or "").strip()
        if not provider or not token or not url.startswith(("http://", "https://")) or not name:
            continue
        key = (provider, token.lower())
        if key in keys:
            continue
        keys.add(key)
        entry: dict[str, Any] = {
            "name": name,
            "provider": provider,
            "token": token,
            "careersUrl": url,
            "sector": row.get("sector") or "software",
            "origin": "admin",
        }
        added.append(entry)
    merged = sorted([*existing, *added], key=lambda r: (r["name"].lower(), r["provider"]))
    return merged, added


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(SEED_PATH))
    parser.add_argument("--dry-run", action="store_true", help="Print additions without writing.")
    args = parser.parse_args()

    from app.discovery.db import connect

    with connect() as conn:
        rows = conn.execute(
            """SELECT company_name, provider, token, careers_url, sector
               FROM company_sources
               WHERE origin = 'admin' AND enabled = 1
               ORDER BY company_name"""
        ).fetchall()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []
    merged, added = merge_sources(existing, rows)

    for entry in added:
        print(f"+ {entry['name']}  {entry['provider']}/{entry['token']}  {entry['careersUrl']}")
    print(f"{len(rows)} admin sources in the database, {len(added)} new for the registry.")
    if args.dry_run or not added:
        return
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(merged)} sources to {out_path}")


if __name__ == "__main__":
    main()
