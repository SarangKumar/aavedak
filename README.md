# Aavedak

Personal job-search operating system.

> **Aavedak recommends and prepares. The user decides and sends.**

अवसर — opportunity.

## Prerequisites

| Tool    | Version                                                    |
| ------- | ---------------------------------------------------------- |
| Node.js | **20+** (LTS recommended)                                  |
| pnpm    | **12.6.0** (via Corepack or install)                       |
| Python  | **3.12** preferred (`python3.12` / Homebrew `python@3.12`) |

## Quick start (fresh clone)

```bash
./scripts/setup.sh
# or: bash scripts/setup.sh
# or: pnpm setup
```

The script installs JS deps, creates the API venv, copies env examples when missing, and prints next commands.

Then in two terminals:

```bash
pnpm dev
# → http://localhost:3000

source apps/api/.venv/bin/activate
cd apps/api && uvicorn app.main:app --reload --port 8000
# → http://127.0.0.1:8000/health
```

## Manual setup

If you prefer not to use the script:

```bash
# 1. Install JS workspace
pnpm install

# 2. Web env (see apps/web/README.md → Env)
cp apps/web/.env.example apps/web/.env.local
# Optional prod-oriented defaults: cp apps/web/.env.example apps/web/.env
# .env.local overrides with localhost; .env uses https://aavedak.vercel.app
# Ensure NEXT_PUBLIC_API_URL=http://127.0.0.1:8000

# 3. API env + venv
cp apps/api/.env.example apps/api/.env
cd apps/api
python3.12 -m venv .venv   # prefer 3.12; setup.sh recreates if < 3.11
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cd ../..

# 4. Run
pnpm dev
# + uvicorn as above
```

## Scripts

| Command                           | What it does                     |
| --------------------------------- | -------------------------------- |
| `pnpm setup`                      | Run `scripts/setup.sh` bootstrap |
| `pnpm dev`                        | Next.js web app (port 3000)      |
| `pnpm build`                      | Production build for web         |
| `pnpm start`                      | Start production web server      |
| `pnpm lint`                       | ESLint for web                   |
| `pnpm format`                     | Prettier write                   |
| `pnpm format:check`               | Prettier check                   |
| `pnpm dev:web` / `pnpm build:web` | Same as `dev` / `build`          |
| `pnpm --filter extension build`   | Extension stub (no-op for now)   |

## Monorepo map

```
aavedak/
├── apps/
│   ├── web/          Next.js App Router + TS + Tailwind v4
│   ├── api/          FastAPI (uvicorn)
│   └── extension/    Chrome extension stub
├── docs/             Product & architecture notes
├── scripts/          Bootstrap and tooling
└── package.json      Workspace root
```

### App routes (no username prefix)

`/dashboard` · `/jobs` · `/job-tracker` · `/documents` · `/referrals` · `/onboarding` · `/admin`

### Shareable profile only

`/{username}` · `/{username}/settings`

## Environment files

| App | File(s)                                        | Notes                                                        |
| --- | ---------------------------------------------- | ------------------------------------------------------------ |
| Web | `apps/web/.env.local` (preferred), then `.env` | Copy from `apps/web/.env.example`. **Never commit secrets.** |
| API | `apps/api/.env`                                | Copy from `apps/api/.env.example`.                           |

**Local scaffold**

- Web needs `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`) for `pnpm dev`.
- Auth/Google keys (`BETTER_AUTH_*`, `GOOGLE_*`, optional `AUTH_DATABASE_URL`) — see Auth section / `apps/web/README.md`.
- API starts with an empty `DATABASE_URL`; DB-backed features won’t work until you set it. `CRON_SECRET` and R2 keys are optional for the health stub.

Generators and scripts must read the **app-specific** env file — never mix web and API keys.

## Auth (web)

Better Auth + **Google only**. Local SQLite at `apps/web/data/local.db` (gitignored); production will use MySQL via `AUTH_DATABASE_URL`.

1. Create a Google OAuth Web client; redirect URI:
   `http://localhost:3000/api/auth/callback/google`
2. Fill `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `apps/web/.env.local`
   (`BETTER_AUTH_SECRET` + `BETTER_AUTH_URL` required; scaffold generates a secret if empty).
3. `pnpm --filter web dev` → `/sign-in`

Without Google keys the app still builds; `/sign-in` shows setup help. Details: `apps/web/README.md`.

## UI / design

Web theme tokens and fonts follow [Vinyaas](https://vinyaas.vercel.app) (oklch CSS variables, Geist, dark default). Brand icon: `apps/web/public/brand/icon.png`.

## Git

**Local git only** for now. Do **not** add remotes or push to GitHub unless explicitly requested.

## Docs

See [`docs/`](./docs/) for IA, domain glossary, API resources, and decisions.
