"""Resolve shared data files at the repo root (`data/…`), with an env override.

The override may be absolute, or relative to the repo root or the working directory, so the
same value (e.g. `data/locations/canonical-locations.json`) works whether the API runs from
the repo root, from `apps/api`, or from a bundle that copies `data/` next to it.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]


def resolve_data_file(env_var: str, default_relative: str) -> Path | None:
    raw = (os.environ.get(env_var) or "").strip() or default_relative
    path = Path(raw)
    candidates = (
        [path]
        if path.is_absolute()
        else [REPO_ROOT / path, Path.cwd() / path, Path(__file__).resolve().parents[2] / path]
    )
    return next((c for c in candidates if c.is_file()), None)
