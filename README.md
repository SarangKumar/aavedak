# Avsar

Personal job-search OS. **Avsar recommends and prepares. The user decides and sends.**

## Monorepo

- `apps/web` — Next.js (App Router) + TypeScript + Tailwind + Vinyaas
- `apps/api` — FastAPI
- `apps/extension` — stub (Chrome later)

## Scripts (root)

```bash
pnpm install
pnpm dev          # web
pnpm build
pnpm lint
pnpm format
pnpm --filter extension build
```

## Env loading

- Web: `.env.local` then `.env` under `apps/web` (never commit secrets)
- API: `apps/api/.env`
- Copy from each `.env.example`
- Generators/scripts must read the **app-specific** env file, not mix web/api keys

## API local

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Git

Local git only for now. Do **not** push to GitHub unless explicitly requested.

## Product docs

See `docs/`.
