# Job & people discovery (operations)

Discovery runs entirely in **FastAPI** (`apps/api/app/discovery/`, see its `DISCOVERY.md`
for internals). This page covers how it runs, how to configure it, and how to operate it.

## What users get

- **Jobs → Discover jobs**: up to `discovery_daily_limit` (50) new recommendations per user
  per IST day — junior tech roles (engineering, data, ML/AI, QA, IT, security,
  design, junior product) in India or remote and open to India (stated minimum experience
  under 3 years), ranked against the user's resume text and career preferences. Recommendations
  accumulate until the user applies, bookmarks, or ignores them.
- **Jobs → Applied jobs**: jobs with an application (any non-archived status).
- Jobs older than `job_expiry_days` (30) from their **posting date** leave both tabs.
  Linked applications in an early status are marked `Rejected` (reason `job_expired`)
  once; history stays in the tracker. See `docs/decisions.md`.
- **Profile settings → Job discovery** turns daily recommendations off/on per user, and
  **Run matching again** re-runs `ranking.rerank_user` for that user on demand (the same work a
  career-preference or resume change triggers): open recommendations are re-scored, ones that no
  longer fit are hidden, ones an earlier run hid are restored if they fit again, and the list is
  topped up within the day's cap. Applications, bookmarks and ignored roles are never re-offered
  or changed. It does nothing while discovery is paused or the account is unapproved.
- **People at {company}** on each job: contacts linked to that company, ordered by
  referral relevance, then community up/down votes (one vote per user per person).

## Schedule (vercel.json, UTC; Hobby = once/day per cron, ±59 min)

| Cron                                   | When (UTC)                        | Purpose                                                                                              |
| -------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/svc/v1/discovery/cron/scan/0..1`     | 00:15, 12:15 (≈ 05:45, 17:45 IST) | Scan one registry shard each — twice a day. Drains finish whatever a run could not fit in its budget |
| `/svc/v1/discovery/cron/expire`        | 00:15                             | Expire old jobs, auto-reject early applications                                                      |
| `/svc/v1/discovery/cron/prune-filled`  | 00:45                             | Drop filled / removed-from-portal jobs from Discover                                                 |
| `/svc/v1/discovery/cron/rank`          | 01:15 (≈ 06:45 IST)               | Top up recommendations from the whole pool                                                           |
| `/api/cron/people-discovery?slot=0..1` | 00:17, 12:17                      | People discovery (morning/evening); web → API                                                        |
| `/svc/v1/discovery/cron/drain/0..2`    | 05:15, 11:15, 17:15               | Finish leftover / retrying items (3×/day; Hobby Active CPU)                                          |
| `/api/cron/process-follow-ups` (web)   | 07:00                             | Due follow-up queue                                                                                  |
| `/api/cron/sync-replies` (web)         | 07:30                             | Gmail reply sync                                                                                     |

Scan/drain crons use `discovery_cron_tick_budget_seconds` (90 s); web-proxied ticks
(admin, people) use `discovery_tick_budget_seconds` (45 s). Whatever is left is picked up by
the next drain cron (or the Admin page while open — close Admin when idle so ticks stop).
Writes happen per company right after it is scanned, with bulk statements, so no single cron
holds the database. Set `DISCOVERY_ENABLED=false` to pause ingest without removing crons.

## Admin page

`/admin` → **Discovery**: source registry (search, enable/disable, bulk-add career URLs,
re-import the verified seed list), "Scan all sources now", run expiry / ranking on demand,
**bulk people discovery** (CSV upload → batched run), and run progress with retry of failed
items. Admin actions go web → `POST /api/admin/discovery` (allowlist check) → FastAPI with
`CRON_SECRET`.

`/admin` → **Careers pages**: the careers-page registry with each page's last crawl.

`/admin` → **Source health** (`GET /api/admin/discovery/health` → `/admin/health`): the one
page to check when jobs stop arriving.

- **Coverage** — boards configured / succeeded in the last 7 days / failing, careers pages
  configured and readable, candidates in the discovery ledger, plus a badge per hiring
  platform (`succeeded/configured`, last success, postings on its last scan) and one per
  careers-page reading method.
- **Job flow** — active jobs, and added / updated / closed / expired in the last 24 h, plus
  open jobs no source has re-listed for 10+ days. If the **outage guard** stopped a source
  from closing its jobs, the companies are named here: nothing was closed, and the next
  scan decides (see DISCOVERY.md "Outage guard").
- **Validation problems** — open shared jobs with an invalid link, a blank title, an empty or
  very short description, and duplicate dedupe-key groups. Ingest already refuses a posting
  without a valid http(s) link or a title, so these should stay at or near zero.
- **Discovered companies** — the ledger: each candidate, where it was found (Workable index,
  a user's application, a shared job, a careers-page embed), what it resolved to, and whether
  a board or a careers page was registered from it. **Discover companies** collects new
  candidates and works them for ~40 s; the scan and drain crons continue in the background.

What to look at when **new jobs stop arriving**: Coverage → is one platform's
`succeeded/configured` down? Job flow → did "Added 24h" drop while "Closed 24h" spiked (a
source changed shape)? Was the outage guard triggered? Then open the failing rows in
**Discovery → Sources** or **Careers pages** for the exact error.

People CSV: header row; `name` required; optional `company`, `role`/`title`, `email`,
`linkedin`, `source_url`. Max 4 MB per upload (Vercel request limit); split larger files.

## Env and tuning

Env (repo-root `.env`, shared with the web app) carries only deployment values and secrets: `DATABASE_URL`, `CRON_SECRET`
(must equal the web app's), and `DISCOVERY_ENABLED` (global kill switch). See docs/env.md.

Tuning is typed and lives in code: `DiscoveryTuning` in `apps/api/app/discovery/config.py`.
Change a value there (and commit); it is no longer read from env.

| Setting                              | Default | Purpose                                                           |
| ------------------------------------ | ------- | ----------------------------------------------------------------- |
| `discovery_daily_limit`              | `50`    | New recommendations per user per IST day                          |
| `job_expiry_days`                    | `30`    | Expiry by posting date (web display mirrors it)                   |
| `ingest_max_min_years`               | `10`    | Skip roles whose min years (stated or title-inferred) exceed this |
| `experience_window_years`            | `2`     | Match jobs with min years in [0, user YOE + this]                 |
| `default_years_experience`           | `0`     | YOE assumed when the profile has none                             |
| `include_internships`                | `false` | Also keep internships                                             |
| `discovery_shards`                   | `2`     | Must match the number of scan crons in `vercel.json`              |
| `discovery_fetch_concurrency`        | `4`     | Sources fetched in parallel per tick (Hobby Active CPU)           |
| `discovery_tick_budget_seconds`      | `45`    | Work per web-proxied tick (admin / people cron)                   |
| `discovery_cron_tick_budget_seconds` | `90`    | Work per scan/drain cron invoke (API, Hobby Active CPU)           |
| `discovery_lease_seconds`            | `180`   | Lease on a claimed run item                                       |
| `discovery_min_match_score`          | `30`    | Minimum match (users with skills/resume text)                     |
| `discovery_max_attempts`             | `3`     | Retries per run item                                              |
| `discovery_max_failures`             | `5`     | Then a source is only retried weekly                              |
| `discovery_http_timeout_seconds`     | `20`    | Per-request timeout for job sources                               |
| `discovery_user_agent`               | bot UA  | User-Agent for every discovery request                            |
| `smartrecruiters_detail_limit`       | `40`    | Per-company detail fetches                                        |
| `people_batch_size`                  | `100`   | Rows per people-import item                                       |
| `people_*`                           | —       | People discovery limits, see DISCOVERY.md                         |

The web app reads the same file/project env (`CRON_SECRET`, `NEXT_PUBLIC_API_URL`).

## Local

```bash
pnpm dev:api   # FastAPI on :8000
pnpm dev       # web on :3000 → /admin → Discovery → "Scan all sources now"
# or call the API directly (CRON_SECRET unset is allowed outside production):
curl -s http://127.0.0.1:8000/svc/v1/discovery/cron/scan/0
curl -s http://127.0.0.1:8000/svc/v1/discovery/cron/rank
```

## Replaced

The old web ingest (`/api/cron/jobs-ingest`, `JOBS_FEED_URL`, `JOBS_INGEST_SAMPLE`,
`JOBS_INGEST_LIMIT`) was removed. A permitted JSON feed can be added as a `json_feed`
source (token = feed URL). Demo and sample jobs were removed entirely: the web app deletes
any leftover rows (example.com URLs, source `demo`, feed `sample-*`) on startup, keeping
applications and cover letters created from them but unlinking the job.
