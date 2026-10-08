# Aavedak API

FastAPI backend for Aavedak.

## Structure

```
apps/api/
├── main.py               # Vercel entrypoint (main:app)
├── pyproject.toml
├── app/
│   ├── main.py           # FastAPI routes under /svc/*
│   └── core/
│       ├── config.py
│       └── logging.py
├── requirements.txt
├── requirements-dev.txt
├── .env.example
└── .venv/                # local virtualenv (gitignored)
```

## Setup

```bash
cd apps/api
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
```

Or: `pnpm setup` / `./scripts/setup.sh`.

## Run (API only)

```bash
cd apps/api
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

Health: `GET /svc/health` → aggregate object:

```json
{
  "ok": true,
  "service": "api",
  "checks": {
    "backend": { "ok": true, "service": "api" },
    "google": { "ok": true, "configured": true, "provider": "google" },
    "betterAuth": { "ok": true, "configured": true, "url": "http://localhost:3000" },
    "database": { "ok": true, "configured": true, "latencyMs": 12.3 }
  }
}
```

Returns **503** if any check fails. Local: `http://127.0.0.1:8000/svc/health`.

## Vercel Services (same project as Next)

Root `vercel.json` builds **web** + **api** together.

| Environment                    | Health URL                              |
| ------------------------------ | --------------------------------------- |
| `vercel dev` / `vercel dev -L` | `http://localhost:3000/svc/health`      |
| API-only uvicorn               | `http://127.0.0.1:8000/svc/health`      |
| Production                     | `https://aavedak.vercel.app/svc/health` |

Next.js stays at `/` and `/api/*`. FastAPI is only under `/svc/*`.

### Critical: Root Directory

In **Vercel → Project → Settings → General → Root Directory**, set **`.` (repository root)**. Clear / remove `apps/web` if that is set.

If Root Directory is `apps/web`, Services are ignored and `/svc/health` shows the **Next.js** 404 (Aavedak chrome) — that is the production failure mode.

### Local (web + api like production)

```bash
# from repo root
npx vercel login
npx vercel link          # link this repo root to the aavedak project
pnpm dev:vercel          # vercel dev
pnpm dev:vercel:local    # vercel dev -L  (fully local; -L = --local)
```

There is no `vercel run` for Services. Use **`vercel dev`** / **`vercel dev -L`**.

## Env

| Variable          | Required for health stub | Notes                                                      |
| ----------------- | ------------------------ | ---------------------------------------------------------- |
| `LOG_LEVEL`       | No (default `INFO`)      |                                                            |
| `API_PREFIX`      | No (default `/svc`)      | Must match public mount + web `NEXT_PUBLIC_API_URL` suffix |
| `PUBLIC_BASE_URL` | No                       | App origin (`http://localhost:3000` / prod Vercel URL)     |
| `DATABASE_URL`    | No                       | Empty → API starts; DB features won’t work                 |
| `CRON_SECRET`     | No                       | Protected cron routes later                                |
| `R2_*`            | No                       | Object storage later                                       |

Web clients use `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:3000/svc` or `https://aavedak.vercel.app/svc`) — see `apps/web/lib/api-url.ts`.

## Logging

Request middleware in `app/main.py` logs method, path, status, and duration.
