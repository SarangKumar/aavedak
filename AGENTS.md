# Aavedak — Agent Instructions

## 1. Project Overview

Aavedak is a job-search project that helps users analyze job opportunities and improve their application workflow.

Priorities: correctness, simplicity, maintainability, and a useful user experience.

For job-search and resume features, prioritize accurate results, transparent reasoning, and graceful handling of incomplete information. Never invent job requirements, skills, qualifications, or application data.

## 2. Commands

pnpm workspace (`apps/*`), pinned to `pnpm@10.26.0` (pnpm 12 breaks Vercel installs). Run from the repo root unless noted.

```bash
pnpm setup                      # bootstrap: pnpm install, apps/api/.venv, env files from examples
pnpm dev                        # Next.js web on :3000
pnpm build                      # web production build
pnpm lint                       # web ESLint, --max-warnings=0
pnpm --filter web typecheck     # tsc --noEmit
pnpm format:check               # Prettier (tailwind plugin)
pnpm dev:api                    # FastAPI on :8000 (python -m uvicorn, uses apps/api/.venv)
pnpm dev:vercel                 # web + api together as on Vercel (/svc/* → FastAPI)
```

Tests:

```bash
# API (pytest), from apps/api with the venv
cd apps/api && .venv/bin/python -m pytest tests -q
.venv/bin/python -m pytest tests/test_reference_engines.py -q -k <name>   # single test

# Discovery SQL tests need a disposable Postgres superuser URL (skipped otherwise)
TEST_DATABASE_URL=postgresql://... .venv/bin/python -m pytest tests/test_discovery_db.py -q

# Web ATS engine tests (plain node:assert script, no test framework), from apps/web
npx --yes tsx lib/ats-engines/run-tests.ts
```

Known pre-existing failures: `tests/test_ats_benchmark.py::test_improvements_never_ask_to_invent` (a structural recommendation lacks the asserted wording), and `pnpm lint` (an unused eslint-disable in `app/opengraph-image.tsx`).

### Agent context files

`AGENTS.md` is the single shared source. Claude reads it via `CLAUDE.md` (`@AGENTS.md`); Cursor reads it natively and via `.cursor/rules/project.mdc`. Area-specific detail goes in a doc next to the code, loaded only on demand through a glob-scoped `.cursor/rules/*.mdc` and a nested `CLAUDE.md` with an `@` import. Don't copy that detail here. When you change an area, update its doc and keep this file's summary accurate.

Local dev: run `pnpm dev` and `pnpm dev:api` together. `next dev` writes to `apps/web/.next-dev` and builds to `.next` (`next.config.ts`), so running `pnpm build` while dev is up is safe; Next rewrites the `next-env.d.ts` reference accordingly — don't commit that churn. In development, `next.config.ts` rewrites `/svc/*` to `API_DEV_PROXY_URL` (default `http://127.0.0.1:8000`). Without the API, the native and reference engines silently use their TS fallbacks and the open-source engines show "Service unavailable". Vercel installs only `apps/api/requirements.txt` (runtime); uvicorn and pytest live in `requirements-dev.txt`. `.vercelignore` keeps tests/scripts/docs out of deployments. `apps/api/.venv` was created under an old path, so its `bin/*` shebangs are broken: call `.venv/bin/python -m <tool>`, or recreate the venv.

The husky pre-commit hook runs lint-staged (ESLint `--fix --max-warnings=0` + Prettier on `apps/web`, Prettier on json/md/yml/css).

## 3. Architecture

- **`apps/web`** — Next.js 15 App Router + React 19 + Tailwind v4. Holds nearly all product logic. React/react-dom are pinned to 19.2.3 via `pnpm-workspace.yaml` overrides (19.3 breaks RSC streaming with Next 15.5) — don't bump them.
- **`apps/api`** — FastAPI: the ATS scoring engine (`app/ats/`), job + people discovery (`app/discovery/`), and `/svc/health`. Every route lives under `/svc/*`. Discovery is the only API code with database access (psycopg).
- **`apps/extension`** — stub, no source.
- **Deployment** — one Vercel project using Vercel Services (`vercel.json`): `/svc/*` → api, everything else → web. The Vercel Root Directory must be the repo root. Middleware must run on the Node runtime (Services don't support Edge). Crons in `vercel.json` call web routes under `app/api/cron/` and discovery routes under `/svc/v1/discovery/cron/*` (Hobby: once per day each, so discovery uses several staggered crons).

### Web app layering

- `app/<page>/page.tsx` — server pages. They gate access via `lib/app-access.ts` (`requireOnboarded`, etc.). `middleware.ts` only checks that a cookie exists and redirects to `/sign-in`, so new protected routes must be added to its `matcher`.
- `app/api/**/route.ts` — route handlers. They authenticate with `requireApiUser()` from `lib/api-session.ts`.
- `lib/*.ts` — the domain/data layer, one module per resource (`applications.ts`, `resumes.ts`, `follow-ups.ts`, …). They issue raw SQL through `getSql()` from `lib/app-db.ts`.
- **Database** — Neon Postgres via `@neondatabase/serverless`, with no ORM and no migration tool. The schema is `CREATE TABLE IF NOT EXISTS` statements in `lib/app-db.ts`, applied lazily by `ensureAppSchema()`. Schema changes go there and must stay idempotent. Columns use TEXT timestamps/JSON and INTEGER booleans (SQLite heritage). `data/local.db` is unused.
- **Auth** — self-hosted Better Auth (`lib/auth.ts`) with Google OAuth only. Better Auth tables live in the same Neon DB. New users need admin approval (`lib/user-approval.ts`; admins come from `ADMIN_EMAILS`).
- **Resume PDFs** are stored in GCS (`lib/gcs.ts`); the DB stores only object keys.
- **Gmail sending** goes through the user's own Gmail (`lib/gmail.ts`, `docs/gmail-oauth.md`). Outreach always requires user confirmation before sending: "Aavedak recommends and prepares. The user decides and sends."
- **Client state** — Redux Toolkit in `lib/store/`.
- **UI** — Vinyaas components installed with `npx vinyaas add <name>` into `components/ui/<name>/` (tracked in `.vinyaas/manifest.json`; local tweaks logged in `components/ui/.vinyaas`), with Vinyaas theme tokens (oklch CSS variables, Geist, dark by default). Add new primitives through the CLI rather than hand-copying files.

### ATS scoring (spans both apps)

`/api/ats` (web) → `lib/ats-service.ts` → FastAPI `POST /svc/v1/ats/score` / `score-batch` (base URL from `NEXT_PUBLIC_API_URL` via `lib/api-url.ts`). If the API is unreachable, it falls back to the local TS heuristics in `lib/ats-analyze-fallback.ts`, and the result is tagged `engine: "fastapi" | "fallback"`.

- Python engine (`apps/api/app/ats/`): `resume_profile` + `jd_profile` + `evidence` → `scoring`/`analyze`. It runs in the mode `resume_only`, `role_match`, or `job_match`, chosen automatically. `version.py` emits `engineVersion`; bump it when scoring changes. Notes are in `app/ats/AUDIT.md`.
- `lib/ats-engines/` (web) adds a registry of "reference" engines that approximate third-party ATS tools (Jobscan-, Teal-, SkillSyncer-style, …). Python mirrors them in `reference_profiles.py` / `reference_signals.py` / `reference_weights.py`. Keep both sides consistent when changing weights or signals.
- Four `open_source` engines (Open ATS, ATS Resume Checker, Resume Skills Extractor, Hybrid Resume Analyzer) live only in Python (`oss_profiles.py` on the shared `pipeline.py`). They have no TS fallback and fail explicitly when FastAPI is down.
- The ATS page runs one resume × engine per request: `/api/ats/run` with `stream: true` → FastAPI `/score-engine/stream` (NDJSON stage events). Stage/outcome labels are defined centrally in `lib/ats-engines/stages.ts`; the results-table score cell is a circular `ScoreRing` gauge (`components/ui/score-ring.tsx`). Engines are shown by name with a small Native/OSS/Ref tag (`components/ats-engine-badge.tsx`).
- Full engine methodology, contracts, and the stage protocol are in `apps/api/app/ats/ENGINES.md`. It is auto-loaded for ATS files via `.cursor/rules/ats-engines.mdc` and nested `CLAUDE.md` files; read it before changing any engine.
- Calibration fixtures: `apps/api/app/ats/benchmarks/fixtures.py` (expected ordering: excellent → unrelated for a backend JD) and `apps/web/lib/ats-engines/calibration/`.

### Job & people discovery (FastAPI; web shows results)

All scanning, parsing, filtering, dedupe, ingest, ranking, expiry, and bulk people import live in `apps/api/app/discovery/` (read its `DISCOVERY.md` before changing it; auto-loaded via `.cursor/rules/discovery.mdc` and a nested `CLAUDE.md`). Don't add discovery logic in TypeScript.

- Scope: India-only junior engineering roles (any discipline, stated minimum < 3 years) from public ATS posting APIs (Greenhouse, Lever, Ashby, SmartRecruiters, Workable) and JSON-LD career pages; filters run before anything is stored. Verified seed registry in `app/discovery/data/career_sources.json` (`scripts/verify_career_sources.py`).
- Work runs as persistent leased run items processed in budgeted ticks (cron, drain crons, or the admin page) — never one long request. Writes happen per company with bulk SQL.
- Web: `lib/jobs.ts` (`listDiscoverJobs` / `listAppliedJobs`), Jobs tabs in `components/jobs-hub.tsx`, votes in `lib/people.ts`, the per-user `discoveryEnabled` preference, and the admin panel (`components/admin-discovery-panel.tsx` → `/api/admin/discovery/*` → FastAPI via `lib/discovery-api.ts` with `CRON_SECRET`).
- Schema: pipeline tables are created by `app/discovery/schema.py`; columns on web-owned tables stay in `lib/app-db.ts` and are mirrored there (a test checks the mirror). Ops/env: `docs/jobs-ingest.md`.

### Env and docs

- Env files are per app and must not be mixed: web uses `apps/web/.env.local` (overrides `.env`); api uses `apps/api/.env`. Scripts must read the env file of the app they serve. Keep configuration and secrets out of source code.
- `docs/decisions.md` holds frozen product rules (status enum, application vs. job, resume, and email rules). Read it before changing domain behavior. Also see `docs/domain-glossary.md` and `docs/api-resources.md`.
- `scripts/wipe-all-data.mjs` destructively clears Neon app/auth tables and GCS `resumes/`. Never run it unless explicitly asked.

## 4. Development Workflow

For each task:

1. Inspect the relevant implementation, configuration, tests, and current Git status.
2. Identify the intended behavior and the smallest suitable change; implement only the requested scope.
3. Add or update focused tests when behavior changes, including edge cases and failure paths.
4. Update the changelog and relevant docs (see §6).
5. Run focused checks first, broader ones when justified, and report actual results.

Rules:

- Use the technologies, versions, and conventions already in the repository. Don't introduce dependencies, tools, services, or architectural layers without clear justification; explain significant trade-offs before major changes.
- Preserve API contracts, persisted data formats, and user-facing behavior unless a change is intentional — never change them silently.
- Keep external integrations behind their existing boundaries, and validate external data, handling missing, malformed, or unavailable data safely.
- Never overwrite, discard, or revert existing user changes, and don't modify unrelated files just to make checks pass.

## 5. Code Quality

- Prefer simple, readable, explicit code with clear responsibilities.
- Use accurate types and validate data at boundaries.
- Handle errors where they can be meaningfully recovered from.
- Comment non-obvious reasoning, constraints, and edge cases.
- Avoid premature optimization and unnecessary abstractions.

## 6. Changelog and Documentation

Record every major change in `CHANGELOG.md` (Keep a Changelog, under `[Unreleased]`). It is rendered in-app at `/changelog` via `lib/changelog.tsx`, so entries are user-visible. Don't create a second changelog.

Major changes include new features or behavior changes, API or schema changes, changes to integrations or data-processing logic, workflow or user-facing changes, and significant bug fixes, architecture, or deployment changes. Skip formatting-only entries.

Also update setup instructions, API/architecture docs, or env examples when they are affected.

## 7. Git and Release Safety

The user handles commits manually.

- **Never commit**, and never instruct another agent or tool to commit.
- Never push, tag, release, publish, or deploy unless explicitly requested.
- Inspect Git status before operations that could affect existing work.

## 8. Final Report

Keep it concise: changes made, key decisions, changelog updates, commands run with actual results, and remaining issues, risks, or skipped checks. Never claim a check passed unless it actually ran successfully.
