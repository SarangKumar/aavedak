# Third-party datasets used to grow the registry

Part of `career_sources.json` comes from two public, openly licensed datasets, imported with
`scripts/import_ats_datasets.py`. Both are **CC BY 4.0**, which requires credit — keep the
attributions below, and the credit line on the public `/how-it-works` page, in place.

Neither dataset is treated as truth. They supply a **(platform, board token)** pair, which is
exactly what the registry otherwise has to guess from a company name; every row still has to
pass the same bar as a hand-verified seed before it is stored:

1. the board answers 200 on that platform's public API and its payload parses into postings
   (`jobs/board_probe.probe_board`, one request per row), and
2. it lists at least one India-eligible posting on the day of the import (`--keep india`), the
   rule `verify_career_sources.py` applies.

Rows that pass are written with `"origin": "dataset"` and the `"dataset"` id below, so they
can be told apart from verified seeds and from admin-added sources at any time.

## LastRound AI — ATS Company Directory

- **Id in the registry:** `lastroundai-ats-company-directory-2026-08`
- **What it gives:** 9,935 companies mapped to their ATS vendor (Greenhouse, Lever, Ashby),
  public board slug and company name. Snapshot crawled 11 July – 1 August 2026.
- **Source:** <https://github.com/fyrosofttech/lastroundai-hiring-data> (`ats-directory/`)
- **Also published:** Figshare DOI [10.6084/m9.figshare.33154145](https://doi.org/10.6084/m9.figshare.33154145)
- **Licence:** CC BY 4.0 — © 2026 LastRound AI. Credit: **LastRound AI**, with a link to the
  [Job Posting Pay Transparency Study](https://lastroundai.com/blog/salary-transparency-study-2026).
- **Why it helps:** it carries the company name as the board reports it, so imported rows get a
  real display name rather than one derived from the token.

## Latmay — ATS Career Page URLs

- **Id in the registry:** `latmay-ats-career-page-urls`
- **What it gives:** 69,638 canonical ATS board URLs across 40 platforms, with the platform
  name. No company names.
- **Source:** <https://huggingface.co/datasets/latmay/ats-career-page-urls>
- **Licence:** CC BY 4.0. Credit: **[Latmay](https://latmay.com)**.
- **How it is read:** the URL is parsed by our own `providers.detect_source`, never by the
  dataset's platform label, so a row only becomes a registry entry if we can address it with a
  provider we support. Rows for platforms we cannot confirm in one request (Workday,
  Teamtailor, Personio) and platforms we do not read at all (BambooHR, JOIN, Dayforce, Getro,
  iCIMS, JazzHR, Jobvite, Zoho Recruit, Pinpoint, …) are counted and skipped.
- **Company names:** absent, so a row that is not also in the LastRound AI directory gets a
  placeholder name derived from its token ("acme-corp" → "Acme Corp"). It is a display label an
  admin can correct, never a claim about the company's legal name.

## Fields the datasets do not supply

- **`sector`** is written as `"software"` for every imported row. Neither dataset carries a
  sector, and the field only groups the public company list, so this is a **default, not
  evidence** — a core-engineering company imported this way will read as software until an
  admin corrects it.
- **`officialCareersUrl`** is left empty: these datasets give the board, not the company's own
  careers page. Discovery detects that by itself (see "Official careers pages").

## Limitations worth knowing

- Both are **snapshots**. Boards disappear: in our import run roughly two thirds of the dataset
  rows no longer resolved, which is why every row is probed rather than trusted.
- The India bar is **a point in time**. A company that hires juniors in India seasonally has no
  India posting on import day and is left out; it can be picked up by a later re-run, or by
  company discovery (`jobs/company_discovery.py`) from the product's own data.
- Neither dataset covers Workday, SmartRecruiters or Taleo well (LastRound AI says so
  explicitly), so large Indian enterprises are still mostly reached through the careers-page
  registry rather than these imports.

## Re-running the import

```bash
cd apps/api
# Count what a dataset would add, no network:
.venv/bin/python scripts/import_ats_datasets.py --lastroundai <csv> --hf <csv> --plan
# Measure the hit rate on a sample before committing to a full run:
.venv/bin/python scripts/import_ats_datasets.py --lastroundai <csv> --hf <csv> --sample 400
# Full run (one request per candidate; only new (provider, token) pairs are probed):
.venv/bin/python scripts/import_ats_datasets.py --lastroundai <csv> --hf <csv> \
  --workers 10 --delay 0.3 --report /tmp/import.json --live-out /tmp/live-boards.json
```

A re-run only ever adds: rows already in the registry (same provider + token, or a company name
already present on another board) are dropped before any request is made.
