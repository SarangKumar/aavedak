# Environment variables

## Layout (one env for web + API)

| Where           | File                                                           | Committed        |
| --------------- | -------------------------------------------------------------- | ---------------- |
| Template        | repo-root `.env.example`                                       | yes              |
| Local values    | repo-root `.env`                                               | no (git-ignored) |
| Local overrides | repo-root `.env.local` (wins over `.env`, e.g. localhost URLs) | no               |
| Production      | Vercel project env vars (one set for the project)              | —                |

- **Next** (`apps/web`) loads the root files with `loadEnvConfig` at the top of `next.config.ts`
  (it would otherwise only read `apps/web/.env*`).
- **FastAPI** (`apps/api`) loads them through pydantic `env_file=ENV_FILES`
  (`app/core/config.py`: root `.env`, then `.env.local`).
- In both, **real environment variables win** over the files, and missing files are ignored,
  so production uses only process env. A variable exported in your shell (even empty) also
  shadows the file value.
- Per-app `apps/web/.env*` and `apps/api/.env` are no longer read; `pnpm setup` warns if
  they exist. Env files carry no comments; this page documents them.

## One Vercel project for both runtimes

`vercel.json` deploys `apps/web` (Next.js) and `apps/api` (FastAPI, `main:app`) as Vercel
**services** of one project, with `/svc/*` rewritten to the API and everything else to web.
Project env vars are injected into every function of the project, Python included, so one
set reaches both. Caveats:

- `NEXT_PUBLIC_*` are inlined into the browser bundle **at build time**: change one, then
  redeploy. Never put secrets in them.
- Vercel limits all environment variables of a deployment to **64 KB in total** (Edge: 5 KB
  per variable). Every function, Node and Python alike, gets
  every project variable, so keep large blobs (e.g. `GCS_PRIVATE_KEY`, ~1.7 KB) to a minimum
  and prefer one of `GCS_PRIVATE_KEY` or `GCS_CREDENTIALS_JSON`, not both.
- `GCS_PRIVATE_KEY`: store it on one line with literal `\n` escapes (the code converts
  them); in the Vercel UI paste it as-is (real newlines are fine there).
- Scope variables per environment (Production / Preview / Development) in Vercel;
  `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `PUBLIC_BASE_URL` differ per environment.
- `vercel env pull` writes a `.env.local`; run it at the repo root so both apps see it.

## Web keys (`apps/web`)

| Variable                                                  | Required    | Notes                                                                                                                                                     |
| --------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                     | yes         | Public origin, e.g. `http://localhost:3000`.                                                                                                              |
| `NEXT_PUBLIC_API_URL`                                     | yes         | FastAPI base. Same origin via Vercel Services: `/svc` (local `vercel dev` → `http://localhost:3000/svc`; API-only uvicorn → `http://127.0.0.1:8000/svc`). |
| `API_DEV_PROXY_URL`                                       | no          | `pnpm dev` proxies `/svc/*` here (default `http://127.0.0.1:8000`).                                                                                       |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED`                   | yes         | Neon Postgres (app data + Better Auth tables).                                                                                                            |
| `BETTER_AUTH_SECRET`                                      | yes         | ≥32 chars, e.g. `openssl rand -base64 32`.                                                                                                                |
| `BETTER_AUTH_URL`                                         | yes         | Same as the app origin.                                                                                                                                   |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                | yes         | Google sign-in (only provider). Gmail send needs the Gmail API + `gmail.send` scope (docs/gmail-oauth.md).                                                |
| `ADMIN_EMAILS`                                            | yes         | Comma-separated admin emails (/admin, approvals). New Google sign-ins need admin approval.                                                                |
| `GCS_BUCKET`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY`       | for resumes | Resume PDFs. Keep the key in double quotes with literal `\n` escapes on one line.                                                                         |
| `GCS_CREDENTIALS_JSON` / `GOOGLE_APPLICATION_CREDENTIALS` | no          | Alternatives to the three GCS vars (the latter for local ADC only).                                                                                       |
| `CRON_SECRET`                                             | yes         | Same value as the API's; bearer for crons and web → API admin calls.                                                                                      |

## API keys (`apps/api`)

| Variable                                                                            | Required    | Notes                                                                                                                                                                                |
| ----------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                                      | yes         | Same Neon database as the web app.                                                                                                                                                   |
| `CRON_SECRET`                                                                       | yes         | Must equal the web app's.                                                                                                                                                            |
| `API_PREFIX`                                                                        | yes         | `/svc` (matches FastAPI routes + the vercel.json rewrite).                                                                                                                           |
| `PUBLIC_BASE_URL`                                                                   | yes         | App origin that fronts the API.                                                                                                                                                      |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | health only | Shared with the web app; reported by `GET /svc/health`.                                                                                                                              |
| `LOG_LEVEL`                                                                         | no          | Default `INFO`.                                                                                                                                                                      |
| `CANONICAL_LOCATIONS_PATH`                                                          | no          | Shared location list. Default `data/locations/canonical-locations.json`; absolute, or relative to the repo root / working directory / `apps/api`. Missing file → locations stay raw. |
| `JD_BOILERPLATE_PATH`                                                               | no          | JD boilerplate patterns, default `data/jd/boilerplate.json` (same resolution). Missing → descriptions stored as parsed.                                                              |
| `DISCOVERY_ENABLED`                                                                 | no          | Kill switch for scans, recommendations and people discovery (default `true`).                                                                                                        |
| `GITHUB_TOKEN`                                                                      | no          | Raises GitHub API limits for people discovery (public data only; no scopes needed).                                                                                                  |
| `BRAVE_SEARCH_API_KEY`, `SERPAPI_KEY`, `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX`           | no          | Any one enables the search-API source for people discovery.                                                                                                                          |
| `HUNTER_API_KEY`, `APOLLO_API_KEY`                                                  | no          | Contact-data providers for people discovery; each skipped when empty.                                                                                                                |
| `TEST_DATABASE_URL`                                                                 | tests       | Optional Postgres for DB-backed tests (skipped when empty).                                                                                                                          |

Tuning (limits, timeouts, batch sizes, user agent, people-discovery budgets) is not env: it is typed in
`DiscoveryTuning` (`apps/api/app/discovery/config.py`), see docs/jobs-ingest.md.

Platform-provided (not set by hand): `NODE_ENV`, `VERCEL_URL`, `VERCEL_ENV`.
