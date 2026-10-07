# Jobs ingest (hourly)

## What runs
- Vercel Cron (`vercel.json`): `0 * * * *` → `/api/cron/jobs-ingest`
- Auth: `Authorization: Bearer $CRON_SECRET` (or `?secret=`). If `CRON_SECRET` is unset, allowed only when `NODE_ENV !== "production"`.

## Env
| Key | Purpose |
|-----|---------|
| `CRON_SECRET` | Protects the cron route (required in production) |
| `JOBS_FEED_URL` | Optional JSON feed URL. Body: job array **or** `{ "jobs": [...] }`. Each item needs `title`, `company`, and `externalId`/`external_id`/`id`. |
| `JOBS_INGEST_SAMPLE` | `1`/`true` to always upsert sample LinkedIn/Indeed/careers stubs. Samples also run when `JOBS_FEED_URL` is unset. |

## Local smoke
```bash
curl -X POST http://localhost:3000/api/cron/jobs-ingest \
  -H "Authorization: Bearer $CRON_SECRET"
```

Jobs land in the shared `jobs` table (`user_id` null). Each user sees them on `/jobs` with Match + ATS scores; **Ignore** hides per user.
