# Aavedak API

FastAPI backend for Aavedak.

## Structure

```
apps/api/
├── app/
│   ├── main.py           # FastAPI app, middleware, /health
│   └── core/
│       ├── config.py     # pydantic-settings
│       └── logging.py
├── requirements.txt
├── requirements-dev.txt
├── .env.example
└── .venv/                # local virtualenv (gitignored)
```

## Setup

Local virtualenv targets **Python 3.12** (Homebrew `python@3.12` / `python3.12`). `scripts/setup.sh` prefers 3.12, then 3.13, 3.11, 3.14, then `python3`.

```bash
cd apps/api
/opt/homebrew/bin/python3.12 -m venv .venv   # or: python3.12 -m venv .venv
source .venv/bin/activate                    # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
```

Or use the monorepo bootstrap: `pnpm setup` / `./scripts/setup.sh`.

## Run

```bash
cd apps/api
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Health check: [http://127.0.0.1:8000/svc/health](http://127.0.0.1:8000/svc/health) → `{"ok":true}`.

OpenAPI docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

## Vercel (same project as Next)

Root `vercel.json` deploys **web** (`apps/web`) + **api** (`apps/api`) via Vercel Services.

| Environment | Health URL                              |
| ----------- | --------------------------------------- |
| Local       | `http://127.0.0.1:8000/svc/health`      |
| Production  | `https://aavedak.vercel.app/svc/health` |

Next.js app routes stay at `/api/*`. FastAPI is only under `/svc/*`.

**Vercel project setting:** Root Directory must be the **repo root** (`.`), not `apps/web`, so both services build after you push.

## Env

| Variable       | Required for health stub | Notes                                      |
| -------------- | ------------------------ | ------------------------------------------ |
| `LOG_LEVEL`    | No (default `INFO`)      |                                            |
| `DATABASE_URL` | No                       | Empty → API starts; DB features won’t work |
| `CRON_SECRET`  | No                       | Protected cron routes later                |
| `R2_*`         | No                       | Object storage later                       |

Copy from `.env.example`. Never commit secrets.

## Logging

Request middleware in `app/main.py` logs method, path, status, and duration. Level comes from `LOG_LEVEL` via `app.core.logging.setup_logging`.
