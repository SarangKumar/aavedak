# Discovery (jobs + people) — FastAPI

All discovery work happens here: scanning career sources, parsing, filtering, dedupe,
ingest, ranking, expiry, bulk people import, and the resumable run framework. The web app
only renders UI, does user-scoped reads and actions (ignore, apply, votes, preferences), and
forwards admin actions to `/svc/v1/discovery/admin/*` after its own allowlist check.

## Scope (product decisions)

- India-only, **engineering roles in any discipline**, junior: stated minimum experience
  `< JUNIOR_MAX_YEARS_EXCLUSIVE` (default 3). Internships excluded unless
  `INCLUDE_INTERNSHIPS=1`. Filters run **before** anything is written, so the database only
  holds relevant jobs; skipped postings are only counted per reason.
- Sources: public ATS posting APIs (Greenhouse, Lever, Ashby, SmartRecruiters, Workable),
  career pages that embed schema.org `JobPosting` JSON-LD (robots.txt respected, no
  crawling), and optional permitted JSON feeds. LinkedIn, Indeed, Glassdoor, Naukri,
  Foundit, Instahyre, Cutshort, and Wellfound have no permitted read access and are **not**
  scraped. NCS has no public listings API.
- Never invent jobs, emails, or verification. Imported emails are `unverified`; phone
  numbers are never imported.

## Layout

```
app/discovery/
  config.py      env settings (DiscoverySettings) + expiry statuses
  db.py          psycopg connection (prepared statements off for the Neon pooler)
  schema.py      pipeline tables + mirrored web-owned columns (see "Schema")
  timeutil.py    ISO-UTC helpers, IST day boundary
  router.py      /svc/v1/discovery/{cron,admin}/*
  jobs/
    models.py    SourceTarget, RawPosting, NormalizedJob, FetchResult
    providers/   one module per source; pure parse() + fetch(); detect_source(url)
    filters.py   India / engineering / junior / experience parsing (pure)
    normalize.py RawPosting → NormalizedJob + content hash + dedupe key
    store.py     per-company incremental upsert, close/reopen
    ranking.py   per-user recommendations (daily cap, min score)
    scoring.py   port of web lib/job-scoring.ts (keep in sync)
    expiry.py    expire jobs + auto-reject early applications (once)
    registry.py  company_sources: seed/admin import, shards, scan status
    scan.py      fetch in threads → write per company on the main connection
  people/
    normalize.py CSV parsing, LinkedIn/email normalization, job relevance (pure)
    store.py     match → enrich (fill gaps only) or create; contacts; relevance links
    importer.py  CSV → persistent run of fixed-size batches
  runs/
    store.py     runs + leased items (FOR UPDATE SKIP LOCKED), retries, progress
    worker.py    budgeted tick dispatching items by kind
  data/
    career_sources.json  verified seed registry (scripts/verify_career_sources.py)
    seed_candidates.txt  candidate names for the verifier
```

## Pipeline

Per company source (one run item):

1. Provider fetches postings (network, worker thread). SmartRecruiters fetches details only
   for new postings that already pass title/location rules (parallel, capped, time-boxed).
2. `normalize_postings` filters and builds `NormalizedJob`s (pure).
3. `store.ingest_company` (one transaction): new → insert job + `job_sources` ref, or link
   to a canonical job with the same dedupe key (company + title + first location token);
   changed hash → update in place (posted_at only moves earlier; empty description never
   overwrites); unchanged → bump `last_seen_at`; missing from a **complete** fetch →
   `closed_at` (unless another source listed it in the last 36h); reappears → reopened.
   Postings already older than the expiry window are never stored.
4. `ranking.recommend(job_ids=new)` → `user_job_state` rows (`recommended_at`, score,
   reasons) + `job_scores`, respecting each user's daily cap and Profile setting.
5. `people.store.link_jobs_to_company_people` refreshes `job_person_relevance`.
6. `registry.record_scan` stores counts / last error on the source.

## Runs, ticks, crons (Vercel Hobby)

- A run = items with leases. A tick claims up to `DISCOVERY_FETCH_CONCURRENCY` items,
  processes them, and repeats until `DISCOVERY_TICK_BUDGET_SECONDS` (default 45) is used.
  Failed items retry up to `DISCOVERY_MAX_ATTEMPTS`; 404 boards / unsupported pages fail
  immediately. A crashed tick's items become claimable when their lease expires.
- `vercel.json` crons (each once/day, ±59 min on Hobby), all UTC:
  scan shards `/cron/scan/0..5` at 18:15–23:15 (≈ 23:45–04:45 IST), `/cron/expire` 00:15,
  `/cron/rank` 01:15, `/cron/drain/0..6` spread through the day. Scan runs are idempotent
  per IST day (`run_key`), so a retried cron resumes instead of duplicating.
- Sources split into shards by `shard_seed % DISCOVERY_SHARDS`. Sources with
  `DISCOVERY_MAX_FAILURES` consecutive failures are retried weekly only.
- The admin page drives ticks while open (`POST /admin/tick`); closing it is safe.

## Expiry

`COALESCE(posted_at, first_seen_at, created_at)` older than `JOB_EXPIRY_DAYS` → `expired_at`
(never cleared). Applications linked to an expired **shared** job in `bookmarked`,
`preparing`, `applied`, `under_review`, `ghosted` move to `rejected` with
`status_reason = job_expired` and a system `application_events` row. A unique index on
system (application, reason) makes it happen once — if the user reopens the application it
is never re-rejected. Manual/pasted jobs and applications without a job never expire.

## People

CSV header row with `name` (required), `company`, `role`/`title`, `email`, `linkedin`,
`source_url`. Match order: normalized LinkedIn → email → name + company dedupe key. A
name+company match with a conflicting email/LinkedIn is not merged (counted `ambiguous`).
Enrichment only fills empty fields. Contacts go to `person_contacts` with source,
provenance URL, and `unverified`. Votes (`person_votes`) are written by the web app and are
a community signal separate from job relevance.

## Schema

Pipeline tables (`company_sources`, `job_sources`, `discovery_runs`,
`discovery_run_items`, `person_contacts`) live only in `schema.py`. Columns on web-owned
tables (jobs, user_job_state, user_preferences, applications, application_events, people,
job_person_relevance) are defined in `apps/web/lib/app-db.ts` and mirrored in
`SHARED_STATEMENTS`; `tests/test_discovery_people.py` fails if the mirror drifts. If the
base web tables don't exist yet, endpoints return 503 instead of creating partial copies.

## Seed registry

`scripts/verify_career_sources.py` tries likely board tokens for each candidate on each
public ATS API and keeps boards with at least one current India posting. Re-run it to grow
or refresh the list; admins can also bulk-import career URLs from the Admin page.

## Tests

```bash
cd apps/api
.venv/bin/python -m pytest tests/test_discovery_jobs.py tests/test_discovery_people.py -q
# SQL paths need a disposable Postgres (superuser URL; a temp database is created per module):
TEST_DATABASE_URL=postgresql://... .venv/bin/python -m pytest tests/test_discovery_db.py -q
```
