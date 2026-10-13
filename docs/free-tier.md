# Free-tier limits and how the app stays inside them

Checked against the providers' docs on 2026-10-13. Limits change: re-check before relying on them.

## Vercel (Hobby)

| Limit                           | Hobby                                                                                    | This app                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Function max duration           | 300 s (default and max, Fluid compute)                                                   | Web routes set `maxDuration = 60`; a discovery tick stops claiming work after `discovery_tick_budget_seconds` (45 s) |
| Cron jobs                       | 100 per project, **each at most once per day**; fires anywhere within the scheduled hour | 25 daily crons in `vercel.json` (people discovery = six separate daily entries `?slot=0..5`)                         |
| Function invocations            | 1M / month                                                                               | ~25 cron calls/day plus traffic                                                                                      |
| Active CPU / provisioned memory | 4 CPU-h, 360 GB-h / month                                                                | Ticks are I/O-bound (network waits are not active CPU)                                                               |
| Env vars                        | 64 KB total per deployment                                                               | See docs/env.md                                                                                                      |

Hobby cannot buy extra usage: going over pauses the project until the next cycle; **no charges**.

## Neon (Free)

100 CU-hours compute per project per month (scale to zero after 5 min idle), 1 GB storage per
project (20 GB account), 5 GB egress per project per month, 10 branches. Over the compute or
egress limit the compute is suspended until the next cycle; over storage, writes that grow it
fail. **No charges** on Free. Each cron wakes the compute, so ~25 short wake-ups a day.

## Google Cloud Storage (resume PDFs)

Always Free: 5 GB-months Standard storage, 5,000 Class A and 50,000 Class B operations,
100 GB egress from North America per month, **only for buckets in `us-east1`, `us-west1` or
`us-central1`** (combined). A bucket in any other location (e.g. `asia-south1`, multi-region
`US`/`ASIA`, or dual-region) is billed from the first byte, and the project has billing
enabled. **Check `GCS_BUCKET`'s location** in the console (Bucket → Configuration → Location);
the location cannot be changed, so a wrong one means creating a new bucket and copying objects.

## Google Custom Search JSON API (people discovery search)

100 queries/day free, then **$5 per 1,000** (up to 10k/day); the day resets at midnight US
Pacific. The project has billing enabled, so overruns would be charged.

- Hard cap in code: `google_cse_daily_query_cap = 90` (`DiscoveryTuning`). Before every query
  the API atomically reserves a slot in `external_api_usage` (provider `google_cse`, period =
  Pacific date), so all six cron slots and manual runs together never send more than 90.
  Once reached, search is skipped until the Pacific day rolls over (`cseCapReached` in run
  counts; usage shown in Admin → People discovery stats).
- One query per company per refresh (`people_refresh_days`), so typically ≤ 12 per run.
- Belt and braces: in Google Cloud Console → APIs & Services → Custom Search API → Quotas,
  set **Queries per day = 100**, so even another client of the same key can't be billed.
- Engine setup: Programmable Search Engine with **Sites to search = `linkedin.com/in/*`** and
  "Search the entire web" off. Queries are `site:linkedin.com/in "<Company>" (recruiter OR …)`.
- Google has closed this API to new customers and **discontinues it on 2027-01-01**; plan a
  replacement (Brave Search API or SerpAPI keys are already supported).

## GitHub REST API

Unauthenticated: **60 requests/hour per IP** (Vercel functions share egress IPs, so the budget
may already be spent by others). With `GITHUB_TOKEN` (no scopes needed): 5,000/hour. Free
either way; exceeding it returns 403, never a charge.

- People discovery reads GitHub's own `X-RateLimit-Remaining` / `X-RateLimit-Reset` on every
  call; when ≤ `github_min_remaining` (10) remain, or on a rate-limit 403, it records a pause
  until the reset in `external_api_usage` (`github_rate_pause`), and all companies and later
  runs skip GitHub until then (`githubPaused` in run counts).
- Per company: ≤ 2 org lookups + 1 member list + `people_github_members` (12) profiles ≈ 15
  requests; a run of 12 companies can need ~180, so **set `GITHUB_TOKEN`** for useful coverage.

## Other optional providers (not capped in code)

Hunter, Apollo, Brave Search and SerpAPI are used only when their keys are set, at most one
request per company per refresh. Their free plans have monthly caps and return errors (no
charge) when exhausted unless a paid plan is attached to the key. Keep them on free plans or
add a cap like CSE's before attaching billing.
