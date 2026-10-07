# Information architecture

## App routes (no username prefix)

| Path | Purpose |
|------|---------|
| `/dashboard` | Application summary / what to do today |
| `/jobs` | Multi-source jobs: cards + detail, resizable split |
| `/job-tracker` | Applications Kanban/list, resizable columns, Active/Archived |
| `/documents` | Resumes, cover letters, templates hub |
| `/referrals` | Referral tracker + follow-ups |

## Shareable profile (username slug)

Username = lowercased Google email local-part (`sarang@gmail.com` → `sarang`); collisions → `sarang-2`, …

| Path | Purpose |
|------|---------|
| `/{username}` | Public/shareable profile (future) |
| `/{username}/settings` | Profile settings (resumes add/remove/activate, prefs) |

Also: `/onboarding`, `/admin` (no username).

## API style

Prefer JSON **request bodies** for POST/PATCH payloads (objects), not stuffing business fields into the URL. IDs in path for resource identity are fine (`/v1/profile/resumes/{id}`).

Resume APIs: `/v1/profile/resumes` …
