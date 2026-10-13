# Discovery (jobs + people) — FastAPI

All discovery work happens here: scanning career sources, parsing, filtering, dedupe,
ingest, ranking, expiry, bulk people import, and the resumable run framework. The web app
only renders UI, does user-scoped reads and actions (ignore, apply, votes, preferences), and
forwards admin actions to `/svc/v1/discovery/admin/*` after its own allowlist check.

## Scope (product decisions)

- **Worldwide tech roles, India first.** Every tech posting is stored wherever it is; each
  gets `jobs.region` (`filters.job_region`): `india` (Indian city/state/tech park, common
  misspellings included), `india_remote` (remote open to India: worldwide / anywhere /
  global / APAC / Asia, not other Asian sub-regions), `remote` (remote tied elsewhere or
  unstated) or `global` (on-site/hybrid outside India), plus `jobs.country_code` (ISO, from
  the canonical city or a single named country). Ranking and the Jobs page put India first.
  SmartRecruiters lists are still requested with `country=in` (its descriptions need one
  detail call per posting, capped per company).
- **Experience is matched per user, not filtered at ingest.** `filters.years_required`
  stores the stated minimum (`jobs.min_years`) and, for an explicit range, the maximum
  (`jobs.max_years`); with nothing stated, a Senior/Lead/level-III title implies 5 and
  Staff/Principal/Architect 8. Ingest skips only executive titles (director, head, VP,
  manager, chief…) and roles above `ingest_max_min_years` (10). Postings already older than
  `job_expiry_days` are skipped (`too_old`).
  Roles (`filters.is_engineering_title`): every engineering title in any discipline (any
  title containing "engineer", plus MTS, GET, software trainee, technology analyst,
  full-stack/frontend/backend) plus data &
  analytics, ML/AI, QA/testing, IT & infrastructure, security, UI/UX/product design, and
  associate product manager / product analyst. Matching uses explicit phrases, so generic
  "analyst" / "scientist" / "designer" titles stay out. Skip reasons keep their names
  (`not_engineering`, `senior_title`, `experience`, `too_old`). Internships excluded unless
  `include_internships = True` (config.py). Filters run **before** anything is written, so the database only
  holds relevant jobs; skipped postings are only counted per reason.
- Sources: public ATS posting APIs (Greenhouse, Lever, Ashby, SmartRecruiters, Workable),
  career pages that embed schema.org `JobPosting` JSON-LD (robots.txt respected, no
  crawling), and optional permitted JSON feeds. LinkedIn, Indeed, Glassdoor, Naukri,
  Foundit, Instahyre, Cutshort, and Wellfound have no permitted read access and are **not**
  scraped. NCS has no public listings API.
- **Add job from a link** (`jobs/single.py`, `POST /admin/parse-job-url`) reads one posting
  the user pasted: ATS board APIs, JSON-LD, then `page_extract.py` (SAP SuccessFactors
  `data-careersite-propertyid` / `itemprop` markup, microdata, og/meta tags, `<h1>` and the
  largest text block). LinkedIn job links (`jobs/linkedin.py`) are read only here, one job per
  user action, from the signed-out guest endpoint `/jobs-guest/jobs/api/jobPosting/<id>`
  with a fallback to the public `/jobs/view/<id>` page (top card, then JSON-LD). Scans never
  fetch LinkedIn.
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
    filters.py   region / tech role / executive / experience parsing (pure)
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

- A run = items with leases. A tick claims up to `discovery_fetch_concurrency` items,
  processes them, and repeats until its budget is used: `discovery_cron_tick_budget_seconds`
  (240 s) for the scan/drain crons Vercel calls on the API directly (300 s Hobby limit), and
  `discovery_tick_budget_seconds` (45 s) for ticks proxied by web routes (`maxDuration = 60`).
  A tick stops claiming once less than `http_timeout + 5` s remain. With concurrency 10 the
  6 scan + 7 drain ticks/day cover a ~1,500-company registry with room for retries.
  Failed items retry up to `discovery_max_attempts`; 404 boards / unsupported pages fail
  immediately. A crashed tick's items become claimable when their lease expires.
- `vercel.json` crons (each once/day, ±59 min on Hobby), all UTC. The repetitive job scan is
  **spread evenly across the day**: shards `/cron/scan/0..5` run every 4 h at
  00:15/04:15/08:15/12:15/16:15/20:15 UTC (so new jobs trickle in all day, not one nightly
  burst). `/cron/expire` 00:15, `/cron/prune-filled` 00:45, `/cron/rank` 01:15,
  `/cron/people-discovery` 02:15, `/cron/drain/0..6` spread through the day. Scan and
  people-discovery runs are idempotent
  per IST day (`run_key`), so a retried cron resumes instead of duplicating.
- Sources split into shards by `shard_seed % discovery_shards`. Sources with
  `discovery_max_failures` consecutive failures are retried weekly only.
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

`COALESCE(posted_at, first_seen_at, created_at)` older than `job_expiry_days` → `expired_at`
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

### People discovery v2 (`people/`)

**Why v1 found almost nothing.** v1 only captured generic `careers@`/`jobs@` inboxes (never a
named person), worked from the scan registry instead of the companies users apply to, ran once
a day, and its items sat in the shared FIFO queue behind the jobs-scan backlog (330 items
pending for days, runs stuck "running"). Result: 3 inboxes from 330 items.

**Targets** (`targets.py`): companies with user applications (matched by name key) or live
shared jobs, most-applied first. `people_discovery_state` is the incremental cursor
(`next_due_at`): a company is claimed when queued, then re-checked after `people_refresh_days`
(double that when nothing was found and no domain is known). Per run at most
`people_companies_per_run` companies; per company at most `people_requests_per_company`
requests (`fetch.Fetcher`, identified User-Agent, robots.txt for every web page, ≥
`people_host_delay_seconds` between hits to one host, 401/403/429 stop that API for the item).
All limits are typed in `config.py` (`DiscoveryTuning`), not env.

**Domain** (`domains.resolve_domain`): official careers URL → where postings live / links in
descriptions → users' application links; hiring platforms (Workday, Greenhouse, Naukri, …)
are excluded. A GitHub org whose website is the domain (or whose display name is exactly the
company's) may supply it. Never guessed from the name.

**Sources** (each lawful/public; each optional source runs only with its key):

| Source             | Module                 | Gives                                                                                                                                                                                                                                                                      | Key                                                                             |
| ------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Company website    | `sources/site.py`      | team / about / leadership pages (≤ `people_site_pages`): schema.org `Person` JSON-LD and "name heading + role line" cards → name, title, published email on the company domain, phone only if in JSON-LD, LinkedIn/Twitter/GitHub links; the careers inbox; the GitHub org | —                                                                               |
| GitHub REST        | `sources/github.py`    | org public members → name, login, location, blog, Twitter, public profile email, short role bio                                                                                                                                                                            | `GITHUB_TOKEN` optional (60 → 5,000 req/h)                                      |
| Search APIs        | `sources/search.py`    | LinkedIn profile URL + "Name - Title - Company" from result titles/snippets only                                                                                                                                                                                           | `BRAVE_SEARCH_API_KEY`, or `SERPAPI_KEY`, or `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` |
| Hunter             | `sources/providers.py` | domain search: personal emails with source URLs, position, LinkedIn, phone (as published), the domain pattern                                                                                                                                                              | `HUNTER_API_KEY`                                                                |
| Apollo             | `sources/providers.py` | people search by domain: name, title, LinkedIn/GitHub/Twitter, city (locked emails ignored)                                                                                                                                                                                | `APOLLO_API_KEY`                                                                |
| Snov.io, Proxycurl | —                      | documented only; not wired (no keys, and Proxycurl reads LinkedIn data)                                                                                                                                                                                                    | —                                                                               |

Metered APIs are guarded across runs in `external_api_usage` (`people/quota.py`): Google CSE
has a hard daily cap (`google_cse_daily_query_cap`, 90, per US-Pacific day), GitHub pauses
until its rate-limit reset when nearly exhausted. See docs/free-tier.md.

LinkedIn is **never** fetched, logged in to or scraped; only URLs/headlines that a search API
returns are stored.

**Emails** (`emails.py`): a company pattern (`first.last`, `flast`, …) is inferred only from
evidence — (name, address) pairs published on the site/GitHub/provider or already stored —
or from Hunter's reported pattern; one pair counts only if it fits a single pattern. The
domain must have MX records (DNS-over-HTTPS via dns.google; no SMTP probing). Inferred
addresses are stored only in `person_contacts` with `verification = 'inferred'` and a
confidence (≤ 70), never in `people.email` (so outreach never sends to a guess) and never
`verified` (`merge.add_contact` refuses it). Personal email/phone are kept only when published
by the person/company or reported by a provider. Patterns live in `company_email_patterns`
(per domain) and are mirrored onto the company record (`companies.email_pattern`,
`email_pattern_domain`, `_confidence`, `_evidence`, `_source`, `_updated_at`). A weaker result
(lower confidence, or equal confidence with fewer supporting emails) never overwrites a stronger
one. The Jobs detail view shows it as "Email format: first.last@domain".

**GitHub commit emails** (`sources/github.py`): for a public org member with no public profile
email, we read `GET /users/{login}/events/public` and take a PushEvent commit author email
(company domain first, else an author name that matches the profile; `noreply` skipped). If the
payload has no commit list, one `GET /repos/{repo}/commits/{sha}` is made. At most 2 extra requests
per member, behind the same `GitHubGuard`, and only while 10+ requests of the per-company budget
remain. Counted as `githubCommitEmails` in run counts.

**Merge** (`merge.py`): LinkedIn → email → GitHub login → name + company (conflicting
identifiers are never merged; counted `ambiguous`). Fill-empty only, so user-entered data
wins. Every reported value goes to `person_field_sources` (field, value, source, source URL,
confidence, first/last seen). People columns added: `seniority`, `department` (from title,
`classify.py`), `company_domain`, `location` (canonical when known), `github_login`/`github_url`,
`website_url`, `twitter_url`, `phone`, `confidence`, `last_seen_at`, `discovery_source`. The
careers inbox is still kept as `"<Company> — Careers"`. People stays one global table.

**Scheduling**: six once-daily Vercel crons (Hobby-compatible) call the web route
`/api/cron/people-discovery?slot=0..5` at 00:17, 04:17, 08:17, 12:17, 16:17 and 20:17 UTC
(Hobby may fire each anywhere within its hour) with `Authorization: Bearer $CRON_SECRET`; the
route calls `POST /admin/people/scheduled`. The daily API cron `/cron/people-discovery`
(02:15 UTC) is an extra fallback. Overlap/retries are safe: each call creates or resumes the
one run for its IST 4-hour slot (`run_key`; the six UTC times land in six different IST
slots even with Hobby drift, and the fallback just resumes slot 1), companies are claimed on
the cursor when queued, and items are leased (`FOR UPDATE SKIP LOCKED`). Ticks use
`kinds=["people_discover_target"]`, so the scan backlog can't starve people work. Creating a
run also closes leftover v1 `people_discover_company` items. Admin: "Discover people now"
(queues due companies + a 40 s people-only tick), the runs chart (people per IST day),
`GET /admin/people/stats` (coverage, sources configured as booleans, targets, limits).
Item counts: `created`, `enriched`, `unchanged`, `ambiguous`, per-source counts,
`emailsPublished`, `emailsInferred`, `pages`, `requests`.

## People location

Each person's raw `location` (GitHub profile, Apollo, a LinkedIn search snippet's
"Location: …" / leading place) is normalized with the canonical locations into
`people.location_city` ("City, Country") and `people.country_code`; rows stored earlier are
backfilled (1,000 per discovery run, idempotent). For a job's "People at company" and the
referrals composer, people are ordered same city → same country → unknown → other country
(still shown, labelled "Other country"; web `lib/people-proximity.ts`). Discovery does not
yet bias which GitHub members it fetches by country: member listings carry no location, so
that would cost extra profile calls.

## Schema

Pipeline tables (`company_sources`, `job_sources`, `discovery_runs`,
`discovery_run_items`, `person_contacts`, `person_field_sources`, `company_email_patterns`,
`people_discovery_state`) live only in `schema.py`. Columns on web-owned
tables (jobs, user_job_state, user_preferences, applications, application_events, people,
job_person_relevance) are defined in `apps/web/lib/app-db.ts` and mirrored in
`SHARED_STATEMENTS`; `tests/test_discovery_people.py` fails if the mirror drifts. If the
base web tables don't exist yet, endpoints return 503 instead of creating partial copies.

## Seed registry

`career_sources.json` is the single repo list of career sources: verified ATS boards plus
exported admin sources (`"origin": "admin"`, no `verified*` counts).

`scripts/verify_career_sources.py` tries likely board tokens for each candidate (name,
hyphenated, first word, then name + `careers`/`jobs`/`hq`/`inc`/`india`/`tech`) on each
public ATS API. `--keep india` (default) keeps boards with at least one current
India-eligible posting (Indian location or remote open to India); `--keep live` keeps any live
board with at least one posting (the scan still stores only India-eligible junior roles).
`--reverify` re-checks every existing row on its own token and drops dead or empty boards;
`--delay` throttles each worker. One board per company name is kept (most India postings
wins). Re-run it to grow or refresh the list; admins can also
bulk-import career URLs from the Admin page. `--skip-known` re-checks only candidates not
yet in the file. Admin imports live in the database only until
`scripts/export_admin_sources.py` (read-only query; `--dry-run` to preview) copies them
into the registry. It only adds; existing entries are never changed. The web `/how-it-works` page lists the seed
companies (imported at build time via `apps/web/lib/career-sources.ts`). Every scan cron
(and the manual scan) syncs the seed first: rows whose (provider, token) or company name
(case/punctuation-insensitive) is already in `company_sources` are skipped, so new seed
boards reach an existing database on the next scan without duplicates and admin edits are
kept. The Admin seed import (`POST /admin/sources/import` with `seed: true`) does the same on
demand.

## Tests

```bash
cd apps/api
.venv/bin/python -m pytest tests/test_discovery_jobs.py tests/test_discovery_people.py tests/test_discovery_salary_official.py -q
# SQL paths need a disposable Postgres (superuser URL; a temp database is created per module):
TEST_DATABASE_URL=postgresql://... .venv/bin/python -m pytest tests/test_discovery_db.py -q
```

## Matching (experience window, India first)

`ranking.recommend` offers a user only jobs whose `min_years` is NULL or at most
`years_experience + experience_window_years` (2; a profile without years counts as
`default_years_experience` = 0). So 0 YOE sees fresher to 2-year roles, 2 YOE sees up to 4. The pool query orders India → India-remote → remote → global before recency, so a large
worldwide pool cannot crowd Indian roles out of `POOL_LIMIT`. The stored ranking value
(`user_job_state.score`) is the match score plus an experience closeness bonus (0–10, highest
when `min_years` equals the user's years; unstated = 5) plus a region bonus (India 12,
India-remote 9, remote 4, global 0). `reasons_json.match` keeps the plain match score, which is
what the UI shows. Re-rank drops open recommendations now outside the window. The Jobs page's
Region menu (`?region=`) defaults to **India first**; India only, Outside India and All regions
are the other views.

## Storage (Neon free 0.5 GB)

Descriptions are HTML-stripped, boilerplate-stripped and capped at 12,000 characters
(`normalize.MAX_DESCRIPTION`); discovered jobs keep no `description_raw`. `/cron/expire` also
empties the description of shared jobs expired or closed for 7+ days that nobody applied to
(`expiry.compact_dead_jobs`); the row stays for dedupe and history (~1 KB).

## Career change re-rank

Saving Career preferences (web `PATCH /api/profile`) calls `POST /svc/v1/discovery/admin/rerank-user`, which runs `ranking.rerank_user`: re-score open recommendations, drop those below `discovery_min_match_score` (`recommended_at` set to NULL; the row stays so the pool never re-offers it), then fill remaining daily budget. Discover orders by score first. Not covered by the test suite: needs a Postgres test run (`TEST_DATABASE_URL`).
