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
- Sources: **company careers pages first** (the `career_pages` registry, ~590 verified pages,
  India-weighted — see "Careers pages registry"), then public ATS posting APIs
  (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Workday, Rippling, Breezy HR,
  Personio, Teamtailor) as a fallback, Workable's public cross-company index (see
  "Cross-company index"), and optional permitted JSON feeds. Every page fetch respects
  robots.txt. LinkedIn, Indeed, Glassdoor, Naukri, Foundit, Instahyre, Cutshort, and
  Wellfound have no permitted read access and are **not** scraped. NCS has no public
  listings API.
- **Companies are discovered, not only curated** (`jobs/company_discovery.py`): candidates
  come from the cross-company index, from companies users already applied to, and from
  careers-page embeds, and each is resolved to a board or a careers page by a bounded,
  polite probe. See "Company discovery".
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
    board_probe.py    token guesses + the public-API probe matrix (shared with the verifier script)
    company_discovery.py  the `discovered_companies` ledger: candidates → board / careers page
    health.py    outage guard (a collapsed "complete" fetch may not close jobs) + health report
    filters.py   region / tech role / executive / experience parsing (pure)
    salary.py    stated salary / stipend from provider pay data or labelled text (pure)
    email_extractor.py  pull published emails from posting text; pick one application inbox (pure)
    normalize.py RawPosting → NormalizedJob + content hash + dedupe key + apply_email
    store.py     per-company incremental upsert, close/reopen
    match.py     the matching engine: eligibility, weighted scoring, explanation, ranking (pure)
    ranking.py   per-user recommendations: the SQL around match.py (daily cap, min score, inputs_key cache); rerank_user() after a profile or resume change
    scoring.py   JD quality score — port of computeAtsScore in web lib/job-scoring.ts (keep in sync)
    expiry.py    expire jobs + auto-reject early applications (once)
    single.py    read one posting from its link for web "Add job" (no filters, nothing stored)
    registry.py  company_sources: seed/admin import, shards, scan status
    scan.py      fetch in threads → write per company on the main connection
    careers_crawl.py  polite crawler for one careers page: robots, rate limit, strategies (pure-ish)
    career_pages.py   career_pages registry: seed import, schedule, record, admin list
    careers_scan.py   run items of kind career_page: crawl → normalize → ingest → record
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
    careers_pages.json   verified careers-page registry (scripts/verify_careers_pages.py)
    careers_candidates.txt  candidate `Name|focus|tier|url [alt urls]` lines for that verifier
```

## Pipeline

Per company source (one run item):

1. Provider fetches postings (network, worker thread). SmartRecruiters fetches details only
   for new postings that already pass title/location rules (parallel, capped, time-boxed).
2. `normalize_postings` filters and builds `NormalizedJob`s (pure), including
   `apply_email` when the description openly publishes an application inbox.
3. `health.guard_complete` decides whether this fetch may close jobs: only when the provider
   said the list was complete **and** the posting count did not collapse against
   `last_posting_count` (see "Outage guard").
4. `store.ingest_company` (one transaction): new → insert job + `job_sources` ref, or link
   to a canonical job with the same dedupe key (company + title + first location token);
   changed hash → update in place (posted_at only moves earlier; empty description never
   overwrites); unchanged → bump `last_seen_at`; missing from a **complete** fetch →
   `closed_at` (unless another source listed it in the last 36h); reappears → reopened.
   Postings already older than the expiry window are never stored.
5. **Official careers page** (when set and due — see below): read its schema.org
   `JobPosting` data with the `jsonld` provider as source `official-{token}` of the same
   company source, using the board's company name so roles merge, and ingest it after the
   board (`complete=False`: a page read never closes jobs).
6. `ranking.recommend(job_ids=new)` runs the matcher (`match.py`) for each eligible user →
   `user_job_state` rows (`recommended_at`, rank score, reasons) + `job_scores` (match score,
   JD quality, breakdown, `inputs_key`), respecting each user's daily cap and Profile setting.
7. `people.store.link_jobs_to_company_people` refreshes `job_person_relevance`.
8. `registry.record_official` stores the page read status (and a detected page URL);
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

## Careers pages registry

The company's own careers page is the source of truth. `career_pages` (one row per page:
`company_name`, `careers_url`, `domain`, `country_focus` `india` | `india_office` | `global`,
`tier`, `enabled`, `strategy`, `platform_token`, `last_checked_at`, `last_status` `ok` |
`no_job_data` | `blocked` | `error`, `jobs_found`, `jobs_kept`, `consecutive_failures`,
`company_source_id`) is seeded from `data/careers_pages.json` on every scan cron
(`career_pages.import_seed`, idempotent by URL or company name; never deletes, never
overwrites an admin's `enabled`).

- **Building the list** — `scripts/verify_careers_pages.py` reads `careers_candidates.txt`,
  fetches each URL (then its alternatives) with the crawler UA and keeps pages that answer
  200 HTML, look like a careers page, are not a soft 404 and are allowed by robots.txt. URLs
  are never invented; a redirect to another company's domain drops the entry. Re-run it to
  refresh (`--workers 12 --delay 0.5 --out ... --report /tmp/report.json`).
- **Crawling** (`careers_crawl.crawl`) — UA `AavedakJobsBot/1.0`, robots.txt per origin,
  ≥ 0.6 s between requests to one host, 16 requests / 45 s per page. Strategies in order,
  the first that finds jobs wins and is recorded on the row:
  1. **ATS embed** (`greenhouse`, `lever`, `ashby`, `smartrecruiters`, `workable`,
     `workday`) — the page (or the one "view open roles" page it links to) embeds or links a
     hosted board; its public API is only the parsing mechanism. Complete list, so this read
     may close jobs. Links point back to the company page (`?gh_jid=` / `?ashby_jid=` when the
     board is embedded inline).
  2. **`jsonld`** — schema.org `JobPosting` on the page itself.
  3. **`embedded_json`** — job rows in `__NEXT_DATA__`, `application/json` scripts or
     `window.X = {...}` state (title + location/id keys, largest list wins).
  4. **`jsonld_links`** — up to 8 same-site job detail pages linked from the page.
  5. **`jsonld_sitemap`** — job detail pages from the site's sitemap (robots `Sitemap:` lines,
     relative ones resolved, else `/sitemap.xml`).
     Otherwise `no_job_data` (usually a JavaScript-only page). 401/403/429 → `blocked`.
- **Scheduling** — scan shards queue `career_page` items **before** board items
  (`router._scan_items`). Never-checked, `ok` and `error` pages (< 5 failures) are read daily
  in their shard; `no_job_data` / `blocked` pages weekly. Ordered by tier.
- **Boards become a fallback** — `registry.scheduled_source_ids` skips a board while a
  linked careers page had an `ok`, **complete** read (an ATS embed) within the last 3 days
  (`career_pages.BOARD_COVERED_SQL`). Pages read only partially (JSON-LD, links, sitemap)
  keep their board scanning, and dedupe merges the overlap, so JavaScript-only pages never
  lose jobs. Boards without a careers page are scanned as before.
- **Ingest** — source key `careers`, `SourceTarget(provider="careers", token=domain)`,
  external ids `{page id}:{strategy}:{native id}`, company name from the board when linked so
  roles merge. Same store rules as `jsonld`: links by dedupe key or exact URL, the page link
  wins over a board link, only a complete read closes jobs and only through its own refs.
- **Admin** — `GET /admin/careers-pages` (rows + summary + counts by strategy), `PATCH
/admin/careers-pages/{id}` `{enabled}`, `POST /admin/careers-pages/import`. The web Admin
  page's **Careers pages** section shows them; the homepage lists readable companies and the
  platforms read (`apps/web/lib/careers-showcase.ts`, cached 1 h).

## Cross-company index

`providers/workable_index.py` reads **jobs.workable.com/api/v1/jobs**, the public, keyless
API behind Workable's own cross-customer job board — the only ATS index that is free and
needs no account. It is not one company's board, so it is handled differently:

- the token is a query spec `"{location}:{query}"`; `INDEX_TOKENS` lists them (ten India
  queries + two remote ones). `registry.import_index_sources` creates one `company_sources`
  row per spec (`provider = 'workable_index'`, `origin = 'index'`) on every scan cron, so
  each spec is its own bounded run item and spreads across the shards like any other source.
  They are created from code, not from `career_sources.json`, because they are not companies
  and must not appear in the web app's seed-company lists.
- each posting carries its own company, so ingest creates/links the company per job and the
  external id is the posting's own (`workable-index:{id}`): the same job found through two
  specs is one source ref.
- the result is **never `complete`** — a query view may never close a job.
- paging follows `nextPageToken`, capped at `MAX_PAGES` (6 × 20 postings) per spec.
- every company it reports (name + the website Workable publishes) becomes a
  `company_hints` entry on the `FetchResult`, which `scan.py` hands to company discovery.

## Company discovery

`discovered_companies` is the candidate ledger (`name`, `name_key` unique, `domain`,
`careers_url`, `ats`, `ats_token`, `discovery_source`, `status`, `last_error`, `attempts`,
`checked_at`, `promoted_source_id`, `promoted_page_id`). Three candidate feeds, all from
data Aavedak already reads:

| Feed                           | Written by                                                                   | Gives                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workable_index`               | `record_hints` from `FetchResult.company_hints`                              | company name + the website it publishes                                                                                                                                         |
| `applications` / `shared_jobs` | `collect_from_database` (scan cron, capped by `company_candidates_per_scan`) | companies users applied to, or of live shared jobs, that have no board and no careers page; the domain comes from `people/domains.resolve_domain` (never guessed from the name) |
| `careers_embed`                | `register_embed` from `careers_scan`                                         | a careers page running on a platform we read whose board is not registered (no extra request)                                                                                   |

A candidate already covered by a `company_sources` or `career_pages` row (same
punctuation-insensitive name key) is never added.

**Resolving one candidate** = one leased run item (`company_discovery`), queued by the scan
cron _after_ the pages and boards and capped at `company_discovery_per_scan` (15), so it can
never delay job fetching. Within `RESOLVE_SECONDS` (25) and a request budget:

1. with a known domain, the usual careers paths (`/careers`, `careers.{domain}`, `/jobs`,
   `/about/careers`) are fetched through `PoliteFetcher` (robots.txt per origin, a pause
   between hits to one host). A page counts only if it answered 200 HTML and
   `looks_like_careers_page` (careers wording in the URL/title, not a soft 404) — so a
   redirect to a home page is never stored as a careers page;
2. `detect_embeds` on that page → a board is the better source (a complete posting list), so
   it wins over the page itself;
3. otherwise `board_probe.find_board` tries likely tokens on the public posting APIs
   (`PROBE_ORDER`), 12 requests when nothing was found, one token across the platforms when
   a careers page already was. Personio (XML) and Teamtailor (token = the company's own
   careers host) cannot be probed from a name, so they are only reached through a page embed.

The outcome is persisted and, when something was found, registered with
`origin = 'discovered'`: a board in `company_sources` (with the page as its detected
official careers URL) and the verified page in `career_pages`. `status` is `board`,
`careers_page`, `none` or `error`; `none`/`error` are retried after `RECHECK_SECONDS`
(30 days) up to `MAX_ATTEMPTS` (3). Nothing is invented: a URL is stored only after it
answered, and a board only after its public API returned postings.

Admin: `GET /admin/discovered-companies`, `POST /admin/runs/company-discovery` ("Discover
companies" in the web Admin page's **Source health** section).

## Outage guard and the health report

`jobs/health.py`. A board or page that normally lists dozens of roles and suddenly lists
almost none is far more likely broken (a changed board, a partial outage, a throttled API)
than to have closed everything, and treating that fetch as the complete list would
`closed_at` the whole company. `guard_complete` downgrades such a fetch to incomplete:
`complete` **and** a previous count of at least `OUTAGE_MIN_BASELINE` (10) **and** fewer
than `OUTAGE_MIN_RATIO` (40 %) of it → nothing is closed and the next scan decides. A
guarded fetch does **not** become the new baseline (`last_posting_count` on
`company_sources` / `career_pages` is left alone), so a second day of the same outage is
still guarded; the jobs expire normally if the company really did empty its board.

`source_health` is the read-only report behind `GET /admin/health`: boards configured /
checked / succeeded this week / failing / parked, per-ATS counts with each platform's last
success, careers pages by status and by strategy, jobs active and added/updated/closed/
expired in the last 24 h, and the validation problems among open shared jobs — invalid
links, blank titles, empty or very short descriptions, duplicate dedupe-key groups, and
jobs no source has re-listed for `STALE_AFTER_DAYS` (10). Ingest itself already refuses a
posting without a valid http(s) link (`missing_url`) or without a title (`invalid`).

## Expiry

`COALESCE(posted_at, first_seen_at, created_at)` older than `job_expiry_days` → `expired_at`
(never cleared). Expiry only marks the job; it never changes an application's status. The
tracker badges applications on an expired posting "Posting expired". (An earlier rule moved
early-stage applications to `rejected` with `status_reason = job_expired` and a system
`application_events` row; those records are left as they are.) Manual/pasted jobs and
applications without a job never expire.

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
.venv/bin/python -m pytest tests/test_job_matching.py tests/test_discovery_jobs.py tests/test_discovery_people.py tests/test_discovery_salary_official.py -q
# SQL paths need a disposable Postgres (superuser URL; a temp database is created per module):
TEST_DATABASE_URL=postgresql://... .venv/bin/python -m pytest tests/test_discovery_db.py -q
```

## Matching (`match.py` + `ranking.py`)

One engine produces every recommendation. `match.py` holds the whole decision and is pure
(no database, no network), so each rule is tunable and tested in `tests/test_job_matching.py`;
`ranking.py` only does the SQL around it.

**Stage A — eligibility (hard constraints).** A job is rejected only for something no other
signal can outweigh: archived, expired (`expired_at`), closed/filled (`closed_at`), a stated
minimum above the user's window (`years_experience + experience_window_years`, default +2; a
profile without years counts as `default_years_experience` = 0, so 0 YOE sees fresher to
2-year roles and 2 YOE up to 4), or an explicitly excluded company or title keyword. An
incomplete description, an unmentioned skill or a non-preferred location is **never** a
rejection — those are scored, not filtered.

**Stage B — deterministic score (0–100).** Eight signals, each reporting whether it had any
evidence at all. Weights live only in `match.MatchWeights` and must sum to 1 (`_check()`):

| Signal              | Weight | Evidence used                                                                                               |
| ------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `required_skills`   | .24    | importance-weighted share of the JD's **required** skills found in the resume or profile (`ats.jd_profile`) |
| `role_title`        | .22    | tiered title match: preferred role as a phrase → same taxonomy role → specific word overlap → any tech role |
| `experience`        | .14    | stated `min_years`/`max_years` against the user's years                                                     |
| `location`          | .12    | preferred city, then work arrangement and remote preference, then region                                    |
| `resume_similarity` | .10    | TF-IDF cosine (`ats.text_similarity`) between resume and description, calibrated ×1.8                       |
| `preferred_skills`  | .08    | same as required, for the JD's "nice to have" group                                                         |
| `seniority`         | .06    | the posting's level (provider label, JD wording or title) against the user's band (`ats.seniority`)         |
| `employment_type`   | .04    | the posting's type against a stated preference (no UI collects one yet, so usually no evidence)             |

    score = 100 · ( Σ wᵢ·fᵢ  +  (1 − Σ wᵢ)·unknown_fit )     unknown_fit = 0.45

`Σ wᵢ` over the signals that had evidence is reported as `confidence`; the rest is credited
neutrally, so a thin posting lands between a confirmed poor match and a confirmed good one
instead of being inflated or sunk. Each skill counts once however often it is repeated, and a
skill the posting never mentions is "no evidence", never a penalty. Requirements are read only
from a description of at least `MIN_JD_WORDS` (40) words — a title is never turned into
requirements, so the engine cannot invent any.

**Stage C — optional AI evaluation.** Not implemented; see the section below.

**Stage D — explanation.** `user_job_state.reasons_json` keeps the keys the web app always
read (`skills`, `roles`, `locations`, `minYears`, `maxYears`, `region`, `experienceFit`,
`match`) and adds `engine`, `confidence`, `skillsMatched`, `skillsMissing`, `reasons`,
`uncertainty` and `breakdown`. Each breakdown row carries the signal's own 0–100 fit, its
weight and its `points`; the points (including one `unrated` row for the unknown remainder)
always sum to the overall score. `skillsMissing` means "asked for here, not found in your
resume or profile" — not "you do not have it" — and the UI labels it that way.

**Stage E — ranking.** `user_job_state.score` = match score + region bonus (India 12,
India-remote 9, remote 4, global 0) + recency bonus (≤3 days 6, ≤7 days 4, ≤14 days 2), so the
two nudges together cannot outweigh relevance. Ordering is `(-rank, newer posting, job id)` —
fully determined by the data. Near-identical roles at one company (same title once requisition
ids and word order are set aside; level markers such as "II" are kept) are offered once, and
one company fills at most `max_per_company` (3) of the front of a batch, with its other roles
kept behind it rather than dropped. The pool query orders India → India-remote → remote →
global before recency, so a large worldwide pool cannot crowd Indian roles out of `POOL_LIMIT`.
The Jobs page's Region menu (`?region=`) defaults to **India first**; India only, Outside India
and All regions are the other views.

**Cost and caching.** One pool query per user, never per job; `job_scores.inputs_key` is a
hash of the engine version, the job's own data and the profile/resume data, so a re-rank skips
every job whose inputs are unchanged (counted as `unchanged`), and a resume edit invalidates
only that user's rows. Parsed descriptions are cached by content inside `match.jd_facts`, so a
pool is parsed once per run however many users it is ranked for. The whole engine is
deterministic: same inputs and same weights, same list.

## Optional AI evaluation (not implemented)

This repository has no AI provider: no key, no SDK, no server-side model call anywhere, and the
deployment is Vercel Hobby. Adding one for every scanned job would also cost per job per user,
which the project's budget does not carry. So the engine ships deterministic only, with
`match.apply_second_stage()` as the single place an LLM re-score would attach:

- It runs over the top `SECOND_STAGE_TOP_N` (20) ranked candidates per user, never the pool.
- The evaluator returns `{job_id: {"score": 0-100, "reasons": [...]}}`; anything else —
  a missing key, a non-numeric score, an exception, a timeout — is ignored and the
  deterministic result stands (tested in `tests/test_job_matching.py`).
- A valid verdict is blended at `SECOND_STAGE_WEIGHT` (0.4) and the batch is re-ordered.
- `RankedJob.cache_key` is `inputs_key`, so an implementation stores its verdict against the
  job data + resume/profile version and never pays for the same pair twice.
- Keys would live in the API's env (never the client), prompts would carry only the stored
  description and the user's own resume text, and the feature would stay off by default.

## Storage (Neon free 0.5 GB)

Descriptions are HTML-stripped, boilerplate-stripped and capped at 12,000 characters
(`normalize.MAX_DESCRIPTION`); discovered jobs keep no `description_raw`. `/cron/expire` also
empties the description of shared jobs expired or closed for 7+ days that nobody applied to
(`expiry.compact_dead_jobs`); the row stays for dedupe and history (~1 KB).

## Career change re-rank

Saving Career preferences (web `PATCH /api/profile`), finishing onboarding (`POST /api/onboarding/complete`, after `onboarding_complete` is set), uploading/activating/archiving a resume (`/api/resumes*`, after the response) and an admin approving a user all call `POST /svc/v1/discovery/admin/rerank-user`, which runs `ranking.rerank_user`: re-score open recommendations whose `inputs_key` changed, hide those that no longer pass stage A or fall below `discovery_min_match_score` (`recommended_at` set to NULL and `hidden_reason = 'rerank'`), then fill the remaining daily budget from the pool. Jobs whose inputs are unchanged are left exactly as they are (`unchanged` in the result). The pool includes ranking-hidden rows, so a hidden job that fits the new profile comes back (`restored`); rows the user ignored, applied to or bookmarked are never re-offered. Discover orders by score first. Covered by `tests/test_discovery_db.py` (needs `TEST_DATABASE_URL`).
