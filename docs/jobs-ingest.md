# Job & people discovery (operations)

Discovery runs entirely in **FastAPI** (`apps/api/app/discovery/`, see its `DISCOVERY.md`
for internals). This page covers how it runs, how to configure it, and how to operate it.

## What users get

- **Jobs → Discover jobs**: up to `DISCOVERY_DAILY_LIMIT` (50) new recommendations per user
  per IST day — junior engineering roles in India (stated minimum experience under 3
  years), ranked against the user's resume text and career preferences. Recommendations
  accumulate until the user applies, bookmarks, or ignores them.
- **Jobs → Applied jobs**: jobs with an application (any non-archived status).
- Jobs older than `JOB_EXPIRY_DAYS` (30) from their **posting date** leave both tabs.
  Linked applications in an early status are marked `Rejected` (reason `job_expired`)
  once; history stays in the tracker. See `docs/decisions.md`.
- **Profile settings → Job discovery** turns daily recommendations off/on per user.
- **People at {company}** on each job: contacts linked to that company, ordered by
  referral relevance, then community up/down votes (one vote per user per person).

## Schedule (vercel.json, UTC; Hobby = once/day per cron, ±59 min)

| Cron                                 | When (UTC)                  | Purpose                                         |
| ------------------------------------ | --------------------------- | ----------------------------------------------- |
| `/svc/v1/discovery/cron/scan/0..5`   | 18:15, 19:15 … 23:15        | Scan one registry shard each                    |
| `/svc/v1/discovery/cron/expire`      | 00:15                       | Expire old jobs, auto-reject early applications |
| `/svc/v1/discovery/cron/rank`        | 01:15 (≈ 06:45 IST)         | Top up recommendations from the whole pool      |
| `/svc/v1/discovery/cron/drain/0..6`  | 03:15, 05:15, 09:15 … 17:15 | Finish leftover / retrying items                |
| `/api/cron/process-follow-ups` (web) | 07:00                       | Unchanged                                       |

Each cron call does at most `DISCOVERY_TICK_BUDGET_SECONDS` of work; whatever is left is
picked up by the next drain cron (or the Admin page while open). Writes happen per company
right after it is scanned, with bulk statements, so no single cron holds the database.

## Admin page

`/admin` → **Discovery**: source registry (search, enable/disable, bulk-add career URLs,
re-import the verified seed list), "Scan all sources now", run expiry / ranking on demand,
**bulk people discovery** (CSV upload → batched run), and run progress with retry of failed
items. Admin actions go web → `POST /api/admin/discovery` (allowlist check) → FastAPI with
`CRON_SECRET`.

People CSV: header row; `name` required; optional `company`, `role`/`title`, `email`,
`linkedin`, `source_url`. Max 4 MB per upload (Vercel request limit); split larger files.

## Env

API (`apps/api/.env`, all optional except the first two):

| Key                             | Default | Purpose                                                |
| ------------------------------- | ------- | ------------------------------------------------------ |
| `DATABASE_URL`                  | —       | Same Neon DB as the web app                            |
| `CRON_SECRET`                   | —       | Required in production; must equal the web app's value |
| `DISCOVERY_ENABLED`             | `true`  | Global kill switch for scans + recommendations         |
| `DISCOVERY_DAILY_LIMIT`         | `50`    | New recommendations per user per IST day               |
| `JOB_EXPIRY_DAYS`               | `30`    | Expiry by posting date                                 |
| `JUNIOR_MAX_YEARS_EXCLUSIVE`    | `3`     | Keep postings whose stated minimum is below this       |
| `INCLUDE_INTERNSHIPS`           | `false` | Also keep internships                                  |
| `DISCOVERY_SHARDS`              | `6`     | Must match the number of scan crons in `vercel.json`   |
| `DISCOVERY_FETCH_CONCURRENCY`   | `6`     | Sources fetched in parallel per tick                   |
| `DISCOVERY_TICK_BUDGET_SECONDS` | `45`    | Work per request before handing off                    |
| `DISCOVERY_MIN_MATCH_SCORE`     | `30`    | Minimum match (users with skills/resume text)          |
| `DISCOVERY_MAX_ATTEMPTS`        | `3`     | Retries per run item                                   |
| `DISCOVERY_MAX_FAILURES`        | `5`     | Then a source is only retried weekly                   |

Web (`apps/web/.env.local`): `CRON_SECRET` (same value), `NEXT_PUBLIC_API_URL`.

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
