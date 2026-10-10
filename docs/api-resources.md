# API resources (design)

Base `/v1`. Prefer body objects on POST/PATCH.

## Profile / resumes

- `GET /v1/me`
- `GET|PATCH /v1/profile`
- `GET|POST /v1/profile/resumes` — create uses multipart/body, not path data
- `GET|PATCH /v1/profile/resumes/{id}`
- `POST /v1/profile/resumes/{id}/activate` — empty/confirm body OK
- `POST /v1/profile/resumes/{id}/deactivate`
- `GET /v1/profile/resumes/{id}/file`

## Applications, jobs, analyses, people, outreach, follow-ups, imports, admin, cron

See product review; mutations take JSON bodies (e.g. status change: `POST /v1/applications/{id}/status` with `{ "status": "applied" }`).

## Jobs & discovery (implemented)

Web (session auth):

- `GET /api/jobs` → `{ discover, applied }`; `POST /api/jobs` creates a manual job.
- `POST /api/jobs/parse-url` `{ url }` → `{ job: { title, company, location, url, description, postedAt, source, provider } }`
  read from the posting by FastAPI (`/svc/v1/discovery/admin/parse-job-url`); saves nothing.
  422 with a user-facing `error` when the link can't be read (job sites without permitted
  access, board links, closed postings).
- `POST|DELETE /api/jobs/{id}/ignore`; `GET /api/jobs/{id}/people` (referral contacts).
- `POST /api/people/{id}/vote` with `{ "vote": 1 | -1 | 0 }`.
- `PATCH /api/preferences/tracker` accepts `{ "discoveryEnabled": boolean }`.
- Admin (allowlist): `GET|POST /api/admin/discovery` (`action`: `scan` | `tick` | `expire` |
  `rank` | `import_seed` | `people_import`), `GET|POST /api/admin/discovery/sources`,
  `PATCH /api/admin/discovery/sources/{id}`, `GET|POST /api/admin/discovery/runs/{id}`.

FastAPI (`Authorization: Bearer $CRON_SECRET`), under `/svc/v1/discovery`:

- Cron (GET): `/cron/scan/{shard}`, `/cron/drain/{slot}`, `/cron/expire`, `/cron/rank`.
- Admin: `GET /admin/overview`, `GET /admin/sources`, `POST /admin/sources/import`,
  `PATCH /admin/sources/{id}`, `POST /admin/runs/jobs-scan`, `POST /admin/runs/people-import`,
  `GET /admin/runs/{id}`, `POST /admin/runs/{id}/retry`, `POST /admin/tick`,
  `POST /admin/expire`, `POST /admin/rank`.
