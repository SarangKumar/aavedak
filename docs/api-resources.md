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
