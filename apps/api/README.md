# Avsar API

FastAPI backend for Avsar.

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

```bash
cd apps/api
python3 -m venv .venv          # prefer 3.11+
source .venv/bin/activate      # Windows: .venv\Scripts\activate
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

Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) → `{"ok":true}`.

OpenAPI docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

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
