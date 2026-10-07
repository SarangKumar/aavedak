# Aavedak Web

Next.js (App Router) + TypeScript + Tailwind CSS v4 front end for Aavedak — the personal job-search OS.

**Philosophy:** Aavedak recommends and prepares. The user decides and sends.

## Routes

### App (no username prefix)

| Path           | Purpose                           |
| -------------- | --------------------------------- |
| `/`            | Landing                           |
| `/sign-in`     | Google OAuth (Better Auth)        |
| `/dashboard`   | Today's summary and next actions  |
| `/jobs`        | Multi-source job cards            |
| `/job-tracker` | Application Kanban / list         |
| `/documents`   | Resumes, cover letters, templates |
| `/referrals`   | Referral tracker                  |
| `/onboarding`  | First-run setup                   |
| `/admin`       | Global catalog / ops              |

### Profile (username prefix only)

| Path                   | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `/{username}`          | Shareable public profile                            |
| `/{username}/settings` | Profile settings (resume activate/deactivate, etc.) |

## Run

From the monorepo root (after `pnpm setup` or `pnpm install`):

```bash
pnpm --filter web dev
# or: pnpm dev
```

Build:

```bash
pnpm --filter web build
```

## Env

Three files under `apps/web/`:

| File           | Git           | Role                                                                 |
| -------------- | ------------- | -------------------------------------------------------------------- |
| `.env.example` | **Committed** | Template listing every variable (placeholders only, no secrets).     |
| `.env`         | Ignored       | Production-oriented defaults (`https://aavedak.vercel.app` origins). |
| `.env.local`   | Ignored       | Local overrides (`http://localhost:3000`). Wins over `.env` in Next. |

Neon connection and Auth values (`DATABASE_URL`, `NEON_AUTH_*`, `ADMIN_EMAILS`, API URL when same) should match in `.env` and `.env.local`; only public origins differ.

Copy from the template (`cp apps/web/.env.example apps/web/.env.local`) or run `pnpm setup`. Fill secrets locally — never commit `.env` / `.env.local`.

| Variable                               | Required for local UI | Notes                                                                        |
| -------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | Yes                   | App origin; local `http://localhost:3000`, prod `https://aavedak.vercel.app` |
| `NEXT_PUBLIC_API_URL`                  | Yes                   | Document API; default `http://127.0.0.1:8000`                                |
| `DATABASE_URL`                         | Yes                   | Neon `postgresql://` connection string                                       |
| `NEON_AUTH_BASE_URL`                   | Yes for sign-in       | Neon Console → branch → Auth                                                 |
| `NEON_AUTH_JWKS_URL`                   | Yes for sign-in       | JWKS URL from the same Auth panel                                            |
| `NEON_AUTH_COOKIE_SECRET`              | Yes for sign-in       | 32+ chars; `setup` generates one if empty                                    |
| `ADMIN_EMAILS`                         | No                    | Comma-separated (e.g. `sarangkumar1578@gmail.com`)                           |
| `CRON_SECRET`                          | For Vercel Cron       | Bearer token for `/api/cron/jobs` and `/api/cron/follow-ups`                 |
| `JOBS_FEED_URL` / `JOBS_INGEST_SAMPLE` | No                    | Remote JSON feed, or `1` to allow the bundled sample                         |

Never commit secrets. `apps/web/data/` and `apps/web/.data/` are gitignored.

API env (separate): `apps/api/.env.example` → `apps/api/.env` (also gitignored). See repo root README.

## Auth (Neon Auth + Google)

Frozen stack: **Neon Postgres** and **Neon Auth** with **Google only** (no email/password, no local SQLite, no self-hosted Better Auth).

1. Neon Console → branch → enable Auth → add the Google provider. Put the owner’s Google OAuth client in Neon, not in this app’s env.
2. Authorized redirect URI (register in Google Cloud, then paste into Neon):
   - `{NEON_AUTH_BASE_URL}/callback/google`
3. Trusted domains: `http://localhost:3000` and `https://aavedak.vercel.app`.
4. On the Google provider, include the `https://www.googleapis.com/auth/gmail.send` scope and offline access so follow-up mail can refresh tokens.
5. Copy `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_JWKS_URL` into `apps/web/.env.local`. Generate `NEON_AUTH_COOKIE_SECRET` with `openssl rand -base64 32` (or let `pnpm setup` fill an empty value).
6. `NEXT_PUBLIC_APP_URL` = `http://localhost:3000` locally, `https://aavedak.vercel.app` on Vercel.
7. `pnpm --filter web dev` → open `/sign-in` → Continue with Google. App tables migrate on first database connection. Do not run `pnpm dlx auth migrate`.

Key files: `lib/auth.ts`, `lib/auth-client.ts`, `lib/db-config.ts`, `lib/app-db.ts`, `app/api/auth/[...all]/route.ts`, `middleware.ts`, `app/sign-in/page.tsx`.

Protected routes (cookie check in middleware → `/sign-in`): `/dashboard`, `/jobs`, `/job-tracker`, `/documents`, `/referrals`, `/onboarding`, `/admin`. Public: `/`, `/sign-in`, `/{username}`.

## Vinyaas alignment

- Theme: oklch CSS variables in `app/globals.css` (`:root` + `.dark` + `@theme inline`), matching Vinyaas docs tokens.
- Fonts: Geist + Geist Mono via `next/font/google` (`--font-geist-sans`, `--font-geist-mono`).
- Default shell: `dark` class on `<html>`; light tokens remain available.
- `cn` helper: local `lib/utils.ts` (`clsx` + `tailwind-merge`). Full Vinyaas component registry can be linked later — do not npm-link unless already set up.
- Live reference: https://vinyaas.vercel.app

## Layout

```
apps/web/
├── app/                 # App Router pages + globals.css + layout
├── components/
│   ├── app-shell.tsx    # Header + main + footer
│   ├── site-header.tsx
│   ├── site-footer.tsx
│   └── page-stub.tsx    # Shared empty-state for stubs
├── lib/
│   ├── auth.ts          # Neon Auth server (Google via Neon)
│   ├── auth-client.ts   # React client
│   ├── app-db.ts        # Neon Postgres app tables
│   └── utils.ts         # cn()
├── middleware.ts        # Neon Auth session gate
└── public/brand/icon.png
```

## Jobs (local v1)

- `/jobs`: master-detail cards; sources (manual/linkedin/careers/indeed/demo/other); search + source filter.
- User-scoped `jobs` + `job_analyses` in Neon Postgres. Demo seed stays off on Vercel unless `JOBS_INGEST_SAMPLE=1`.
- Detail actions create Applications (`bookmarked` / `preparing` / `applied`) with `job_id` snapshot.
- Paste JD saves a private analysis stub (no global Job).

## Referrals (local v1)

- `/referrals`: People + Follow-ups. Contacts are **user-scoped** (private outreach email override). Global Person sync later.
- Follow-ups: due date, pending/queued/sent/failed/done/dismissed; optional linked person. Due queued mail sends through Gmail when Neon Auth has `gmail.send`.
- Tables: `people`, `follow_up_tasks` in Neon Postgres.

## Documents hub (local v1)

- `/documents`: Resumes | Cover letters | Templates.
- Resumes reuse `/api/resumes` (+ `GET /api/resumes/[id]/file`). PDF uploads use Vinyaas `FileUpload`.
- Cover letters / templates in Neon Postgres (`cover_letters`, `templates`); archive-not-delete.

## Job tracker (local v1)

- `/job-tracker`: Kanban + list, Active / Archived scopes.
- Applications in Neon Postgres (`applications` table). `job_id` nullable; required snapshot: company, role, location.
- Single status enum (no custom statuses). Column show/hide + view prefs in `user_preferences`.
- Status changes only via user (drag or select) — Aavedak never auto-moves cards.

## Onboarding & resumes (local v1)

- New Google users land on `/onboarding` (`newUserCallbackURL`).
- Gate: authenticated users need ≥1 non-archived PDF resume before `/dashboard` and other app routes.
- Resumes store under `apps/web/.data/resumes/{userId}/` with metadata in `apps/web/.data/app.db` (gitignored).
- Delete = archive only. Display names unique per user. Status: `active` | `inactive` | `archived`.
- Username = email local-part with collision suffix, stored in `profiles` table for `/{username}` links.

## Theme (FOUC)

Theme preference is stored in both `localStorage` and the `aavedak-theme` cookie (`light` | `dark` | `system`). The root layout reads the cookie on the server so `<html class="dark">` and `color-scheme` match on first paint. A blocking inline script in `<head>` is the client backup. Dark is the brand default when preference is unknown.

Hydration warnings mentioning `data-gr-ext-installed` / `data-new-gr-c-s-check-loaded` come from browser extensions (e.g. Grammarly), not the app — `<html>` and `<body>` use `suppressHydrationWarning` for that.

## Dev notes

If styles vanish after `pnpm build` while `next dev` is running, stop the dev server, `rm -rf apps/web/.next`, and start `pnpm --filter web dev` again. A production build overwrites `.next` and breaks the live CSS URLs.
