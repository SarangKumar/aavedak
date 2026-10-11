# Discovery (jobs + people) — FastAPI

All discovery work happens here: scanning career sources, parsing, filtering, dedupe,
ingest, ranking, expiry, bulk people import, and the resumable run framework. The web app
only renders UI, does user-scoped reads and actions (ignore, apply, votes, preferences), and
forwards admin actions to `/svc/v1/discovery/admin/*` after its own allowlist check.

## Scope (product decisions)

- **India or remote-open-to-India**, **tech roles**, junior: stated minimum experience
  `< JUNIOR_MAX_YEARS_EXCLUSIVE` (default 3). Location (`filters.is_india_eligible`): an
  Indian city/state/tech park (common misspellings included), or a remote posting whose
  region includes India (worldwide / anywhere / global / APAC / Asia; not South-East or
  other Asian sub-regions). A bare "Remote" or a non-Indian country code is not enough.
  Roles (`filters.is_engineering_title`): every engineering title in any discipline (any
  title containing "engineer", plus MTS, GET, software trainee, technology analyst,
  full-stack/frontend/backend) plus data &
  analytics, ML/AI, QA/testing, IT & infrastructure, security, UI/UX/product design, and
  associate product manager / product analyst. Matching uses explicit phrases, so generic
  "analyst" / "scientist" / "designer" titles stay out. Skip reasons keep their names
  (`not_india`, `not_engineering`). Internships excluded unless
  `INCLUDE_INTERNSHIPS=1`. Filters run **before** anything is written, so the database only
  holds relevant jobs; skipped postings are only counted per reason.
- Sources: public ATS posting APIs (Greenhouse, Lever, Ashby, SmartRecruiters, Workable),
  career pages that embed schema.org `JobPosting` JSON-LD (robots.txt respected, no
  crawling), and optional permitted JSON feeds. LinkedIn, Indeed, Glassdoor, Naukri,
  Foundit, Instahyre, Cutshort, and Wellfound have no permitted read access and are **not**
  scraped. NCS has no public listings API.
- **The company's own careers page is the primary source of truth.** Each source tracks
  its official careers page (`company_sources.official_careers_url`, see "Official careers
  pages" below); discovery reads it on every scan and a job links to it whenever it lists
  the job. Hiring-platform APIs stay the reliable reader underneath.
- Every stored job keeps its **original posting URL** (`jobs.url`, plus each source's link in
  `job_sources.url`); postings without a valid http(s) link are skipped (`missing_url`), never
  stored. The UI shows the link on every job card.
- **Salary / stipend is shown only when the company states it** (`jobs.salary`, display
  text; `jobs/salary.py`): structured pay a provider publishes (Greenhouse
  `pay_input_ranges` via `pay_transparency=true`, Lever `salaryRange`, Ashby compensation via
  `includeCompensation=true`, schema.org `baseSalary`), else an explicitly labelled figure in
  the posting text ("Stipend: ₹25,000/month", "CTC 6-8 LPA"). Wording without a figure
  ("competitive salary") yields nothing. A non-INR band on an India-located job is dropped
  unless labelled for India (boards often publish another country's band). Salary is part of
  the content hash; an update without pay never erases a stated one, and a duplicate from
  another source only fills pay when none is known.
- Never invent jobs, emails, or verification. Imported emails are `unverified`; phone
  numbers are never imported. Emails are only ever _extracted_ from text that is actually
  published (a posting's description, a CSV, manual entry) — they are never _inferred_ or
  guessed from a name + company domain. `jobs/email_extractor.py` extracts published
  addresses and `best_application_email` picks at most one application/recruiting inbox
  (e.g. `careers@`), returning None rather than guessing when the choice is ambiguous.

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
    filters.py   India-or-remote / tech role / junior / experience parsing (pure)
    salary.py    stated salary / stipend from provider pay data or labelled text (pure)
    email_extractor.py  pull published emails from posting text; pick one application inbox (pure)
    normalize.py RawPosting → NormalizedJob + content hash + dedupe key + apply_email
    store.py     per-company incremental upsert, close/reopen
    ranking.py   per-user recommendations (daily cap, min score); rerank_user() after career changes
    scoring.py   port of web lib/job-scoring.ts (keep in sync)
    expiry.py    expire jobs + auto-reject early applications (once)
    single.py    read one posting from its link for web "Add job" (no filters, nothing stored)
    registry.py  company_sources: seed/admin import, shards, scan status
    scan.py      fetch in threads → write per company on the main connection
  people/
    normalize.py CSV parsing, LinkedIn/email normalization, job relevance (pure)
    store.py     match → enrich (fill gaps only) or create; contacts; relevance links
    importer.py  CSV → persistent run of fixed-size batches
    discover.py  per-company run: capture a published recruiting inbox (career page + postings)
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
2. `normalize_postings` filters and builds `NormalizedJob`s (pure), including
   `apply_email` when the description openly publishes an application inbox.
3. `store.ingest_company` (one transaction): new → insert job + `job_sources` ref, or link
   to a canonical job with the same dedupe key (company + title + first location token);
   changed hash → update in place (posted_at only moves earlier; empty description never
   overwrites); unchanged → bump `last_seen_at`; missing from a **complete** fetch →
   `closed_at` (unless another source listed it in the last 36h); reappears → reopened.
   Postings already older than the expiry window are never stored.
4. **Official careers page** (when set and due — see below): read its schema.org
   `JobPosting` data with the `jsonld` provider as source `official-{token}` of the same
   company source, using the board's company name so roles merge, and ingest it after the
   board (`complete=False`: a page read never closes jobs).
5. `ranking.recommend(job_ids=new)` → `user_job_state` rows (`recommended_at`, score,
   reasons) + `job_scores`, respecting each user's daily cap and Profile setting.
6. `people.store.link_jobs_to_company_people` refreshes `job_person_relevance`.
7. `registry.record_official` stores the page read status (and a detected page URL);
   `registry.record_scan` stores counts (incl. `officialPage`) / last error on the source.

## Runs, ticks, crons (Vercel Hobby)

- A run = items with leases. A tick claims up to `DISCOVERY_FETCH_CONCURRENCY` items,
  processes them, and repeats until `DISCOVERY_TICK_BUDGET_SECONDS` (default 45) is used.
  Failed items retry up to `DISCOVERY_MAX_ATTEMPTS`; 404 boards / unsupported pages fail
  immediately. A crashed tick's items become claimable when their lease expires.
- `vercel.json` crons (each once/day, ±59 min on Hobby), all UTC. The repetitive job scan is
  **spread evenly across the day**: shards `/cron/scan/0..5` run every 4 h at
  00:15/04:15/08:15/12:15/16:15/20:15 UTC (so new jobs trickle in all day, not one nightly
  burst). `/cron/expire` 00:15, `/cron/prune-filled` 00:45, `/cron/rank` 01:15,
  `/cron/people-discovery` 02:15, `/cron/drain/0..6` spread through the day. Scan and
  people-discovery runs are idempotent
  per IST day (`run_key`), so a retried cron resumes instead of duplicating.
- Sources split into shards by `shard_seed % DISCOVERY_SHARDS`. Sources with
  `DISCOVERY_MAX_FAILURES` consecutive failures are retried weekly only.
- The admin page drives ticks while open (`POST /admin/tick`); closing it is safe.

## Official careers pages

`company_sources.official_careers_url` (+ `official_careers_origin`: `seed` | `admin` |
`detected`, `official_status`: `ok` | `no_job_data` | `blocked` | `error`,
`official_checked_at`). Where the URL comes from:

- **seed** — `officialCareersUrl` in `career_sources.json` (fills an empty column on seed
  import; `scripts/export_admin_sources.py` carries it for admin sources);
- **admin** — set or cleared per source in the Admin page's Sources sheet (`PATCH
/admin/sources/{id}` with `officialCareersUrl`);
- **detected** — when ≥ 80 % of a Greenhouse board's postings link to one non-Greenhouse
  host (e.g. `careers.airbnb.com`), that site's root is recorded. Never overwrites a known
  page.

Reading: one page, no crawling, robots.txt respected (`jsonld.robots_allows`). A page with
no `JobPosting` data (usually rendered with JavaScript) or blocked by robots.txt is re-read
weekly instead of every scan (`registry.official_page_due`); a failing page never fails the
board scan. Sources whose provider already is `jsonld` are career pages themselves.

Preference rules in `store.ingest_company`: a page posting links to an existing job by dedupe
key **or exact URL** (catches spelling differences such as Bangalore / Bengaluru when the
board already points at the company's site); when a `jsonld` source lists a job, the job's
`url` becomes that page link, and later board updates never replace it. A board's complete
scan only closes jobs through its **own** provider's refs, so it never closes a role that
only the careers page lists (those still expire normally).

## Expiry

`COALESCE(posted_at, first_seen_at, created_at)` older than `JOB_EXPIRY_DAYS` → `expired_at`
(never cleared). Applications linked to an expired **shared** job in `bookmarked`,
`preparing`, `applied`, `under_review`, `ghosted` move to `rejected` with
`status_reason = job_expired` and a system `application_events` row. A unique index on
system (application, reason) makes it happen once — if the user reopens the application it
is never re-rejected. Manual/pasted jobs and applications without a job never expire.

**Filled / removed from portal.** A posting a company fills or pulls stops being listed, so a
complete scan sets `jobs.closed_at`. Such jobs are already excluded from Discover (the query
filters `closed_at IS NULL`). The daily `/cron/prune-filled` (`expiry.prune_filled_jobs`)
additionally clears their `recommended_at` in `user_job_state` so they can never be
re-offered. Applications are **kept** (never deleted or auto-rejected for this): the web app
flags an application whose linked shared job is `closed_at` or `expired_at`
(`applications.listApplications` → `jobRemovedFromPortal`, and `job-dto` →
`removedFromPortal`) and badges it "Removed from portal" in the tracker and Jobs.

## People

CSV header row with `name` (required), `company`, `role`/`title`, `email`, `linkedin`,
`source_url`. Match order: normalized LinkedIn → email → name + company dedupe key. A
name+company match with a conflicting email/LinkedIn is not merged (counted `ambiguous`).
Enrichment only fills empty fields. Contacts go to `person_contacts` with source,
provenance URL, and `unverified`. Votes (`person_votes`) are written by the web app and are
a community signal separate from job relevance. The web app also adds a system credit (`person_reply_credits`, +1 per user a person replied to) to
the displayed score; discovery does not read it.

**Automatic people discovery (`discover.py`, free, published-only).** Besides CSV import and
manual entry, a daily run (admin button `POST /admin/runs/people-discovery`, cron
`/cron/people-discovery`) captures each company's **published recruiting inbox**. Per company
source it gathers candidate emails from (a) `jobs.apply_email` already extracted from that
company's postings and (b) a single fetch of `company_sources.careers_url` (one page, no
crawling of other paths). It keeps an address only when the local part marks it an
application inbox (`careers@`, `jobs@`, `hr@`, …) via `is_application_inbox`, then upserts it
through `upsert_person` as a clearly-labelled company contact (`"<Company> — Careers"`, role
`Careers / recruiting inbox`, `unverified`) — never a real named person. No emails are
guessed/inferred, no LinkedIn or social profiles are scraped, and no paid/third-party API is
used; richer named-contact data would require a licensed enrichment API, which is not
integrated.

## Schema

Pipeline tables (`company_sources`, `job_sources`, `discovery_runs`,
`discovery_run_items`, `person_contacts`) live only in `schema.py`. Columns on web-owned
tables (jobs, user_job_state, user_preferences, applications, application_events, people,
job_person_relevance) are defined in `apps/web/lib/app-db.ts` and mirrored in
`SHARED_STATEMENTS`; `tests/test_discovery_people.py` fails if the mirror drifts. If the
base web tables don't exist yet, endpoints return 503 instead of creating partial copies.

## Seed registry

`career_sources.json` is the single repo list of career sources: verified ATS boards plus
exported admin sources (`"origin": "admin"`, no `verified*` counts).

`scripts/verify_career_sources.py` tries likely board tokens for each candidate (name,
hyphenated, first word, then name + `careers`/`jobs`/`hq`/`inc`/`india`/`tech`) on each
public ATS API and keeps boards with at least one current India-eligible posting (Indian
location or remote open to India). Re-run it to grow or refresh the list; admins can also
bulk-import career URLs from the Admin page. `--skip-known` re-checks only candidates not
yet in the file. Admin imports live in the database only until
`scripts/export_admin_sources.py` (read-only query; `--dry-run` to preview) copies them
into the registry. It only adds; existing entries are never changed. The web `/how-it-works` page lists the seed
companies (imported at build time via `apps/web/lib/career-sources.ts`). The seed only auto-loads into an empty
`company_sources`; on an existing database, new seed boards arrive via the Admin page's
seed import (`POST /admin/sources/import` with `seed: true`, which inserts missing rows only).

## Tests

```bash
cd apps/api
.venv/bin/python -m pytest tests/test_discovery_jobs.py tests/test_discovery_people.py tests/test_discovery_salary_official.py -q
# SQL paths need a disposable Postgres (superuser URL; a temp database is created per module):
TEST_DATABASE_URL=postgresql://... .venv/bin/python -m pytest tests/test_discovery_db.py -q
```

## Career change re-rank

Saving Career preferences (web `PATCH /api/profile`) calls `POST /svc/v1/discovery/admin/rerank-user`, which runs `ranking.rerank_user`: re-score open recommendations, drop those below `discovery_min_match_score` (`recommended_at` set to NULL; the row stays so the pool never re-offers it), then fill remaining daily budget. Discover orders by score first. Not covered by the test suite: needs a Postgres test run (`TEST_DATABASE_URL`).
