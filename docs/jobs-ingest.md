# Jobs ingest (daily — Vercel Hobby)

Hobby accounts only allow **once-per-day** crons. Hourly (`0 * * * *`) is rejected.

## What runs

- Vercel Cron (`vercel.json`): `0 6 * * *` (06:00 UTC ≈ **11:30 IST**) → `/api/cron/jobs-ingest`
- Auth: `Authorization: Bearer $CRON_SECRET` (or `?secret=`). If `CRON_SECRET` is unset, allowed only when `NODE_ENV !== "production"`.

## Volume (20–50 newest)

Each run upserts **20–50** of the most recent jobs (default **40**):

- External feed (`JOBS_FEED_URL`): parse all rows, sort by `postedAt` / `posted_at` / `published_at` / `created_at` when present (else keep feed order as newest-first), then **clamp** to the limit.
- Sample stubs (`JOBS_INGEST_SAMPLE` or no feed URL): generate a multi-source batch sized to the same limit (LinkedIn / Indeed / careers).
- Optional override: `JOBS_INGEST_LIMIT` (integer clamped to **20–50**).

Shared `jobs` rows use `user_id` null. Users see them on `/jobs` with Match + ATS scores; **Ignore** hides per user.

## Env

| Key                  | Purpose                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`        | Protects the cron route (required in production)                                                                                             |
| `JOBS_FEED_URL`      | Optional JSON feed URL. Body: job array **or** `{ "jobs": [...] }`. Each item needs `title`, `company`, and `externalId`/`external_id`/`id`. |
| `JOBS_INGEST_SAMPLE` | `1`/`true` to always upsert sample LinkedIn/Indeed/careers stubs. Samples also run when `JOBS_FEED_URL` is unset.                            |
| `JOBS_INGEST_LIMIT`  | Optional; how many newest jobs to keep per run (clamped 20–50, default 40).                                                                  |

## Local smoke

```bash
curl -X POST http://localhost:3000/api/cron/jobs-ingest \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Related

- Follow-up mail cron: `/api/cron/process-follow-ups` daily at `0 7 * * *` (07:00 UTC ≈ 12:30 IST) — see `docs/gmail-oauth.md`. Users can also hit **Process due queue** in-app anytime.
