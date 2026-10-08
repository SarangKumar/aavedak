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

Shared secrets (Google OAuth, `BETTER_AUTH_SECRET`, `ADMIN_EMAILS`, `DATABASE_URL`, GCS, API URL when same) should match in `.env` and `.env.local`; only public origins differ.

Copy from the template (`cp apps/web/.env.example apps/web/.env.local`) or run `pnpm setup`. Fill secrets locally — never commit `.env` / `.env.local`.

| Variable               | Required for local UI | Notes                                                                           |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`  | Yes                   | App origin; local `http://localhost:3000`, prod `https://aavedak.vercel.app`    |
| `NEXT_PUBLIC_API_URL`  | Yes                   | Document API; default `http://127.0.0.1:8000`                                   |
| `DATABASE_URL`         | Yes                   | Neon Postgres pooled connection string                                          |
| `BETTER_AUTH_SECRET`   | Yes for auth          | 32+ chars; `setup` generates one if empty                                       |
| `BETTER_AUTH_URL`      | Yes for auth          | Same as `NEXT_PUBLIC_APP_URL`                                                   |
| `GOOGLE_CLIENT_ID`     | Yes for auth          | Google Cloud OAuth Web client                                                   |
| `GOOGLE_CLIENT_SECRET` | Yes for auth          | Google Cloud OAuth Web client secret                                            |
| `GCS_BUCKET`           | Yes on Vercel         | Resume PDF bucket                                                               |
| `ADMIN_EMAILS`         | No                    | Comma-separated admin emails (e.g. `a@x.com,b@y.com`). New users need approval. |

Never commit secrets. Local SQLite paths are unused; auth + app data are on Neon.

API env (separate): `apps/api/.env.example` → `apps/api/.env` (also gitignored). See repo root README.

## Auth (Better Auth + Google)

Frozen stack: **self-hosted Better Auth** with **Google OAuth only** (no Neon Auth, no email/password).
App data + auth tables: **Neon Postgres** via `DATABASE_URL`. Resume PDFs: **GCS**.

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client (Web).
2. Authorized redirect URIs (add both):
   - `http://localhost:3000/api/auth/callback/google`
   - `https://aavedak.vercel.app/api/auth/callback/google`
3. Authorized JavaScript origins: `http://localhost:3000` and `https://aavedak.vercel.app`.
4. Put Client ID / Secret in `apps/web/.env` and `apps/web/.env.local` (same values) as `GOOGLE_CLIENT_*`.
5. Local: `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` = `http://localhost:3000` in `.env.local`.
   Prod: `https://aavedak.vercel.app` in `.env` / Vercel.
6. From `apps/web` (first time / schema change): `pnpm dlx @better-auth/cli@latest migrate`
7. `pnpm --filter web dev` → open `/sign-in` → Continue with Google.

Key files: `lib/auth.ts`, `lib/auth-client.ts`, `app/api/auth/[...all]/route.ts`, `middleware.ts`, `app/sign-in/page.tsx`.

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
│   ├── auth.ts          # Better Auth server (SQLite + Google)
│   ├── auth-client.ts   # React client
│   └── utils.ts         # cn()
├── middleware.ts        # Optimistic session-cookie gate
├── data/                # local.db (gitignored)
└── public/brand/icon.png
```

## Jobs (local v1)

- `/jobs`: master-detail cards; sources (manual/linkedin/careers/indeed/demo/other); search + source filter.
- User-scoped `jobs` + `job_analyses` in `.data/app.db`. Demo seed when empty.
- Detail actions create Applications (`bookmarked` / `preparing` / `applied`) with `job_id` snapshot.
- Paste JD saves a private analysis stub (no global Job).

## Referrals (local v1)

- `/referrals`: People + Follow-ups. Contacts are **user-scoped** (private outreach email override). Global Person sync later.
- Follow-ups: due date, pending/done/dismissed; optional linked person.
- Tables: `people`, `follow_up_tasks` in `.data/app.db`.

## Documents hub (local v1)

- `/documents`: Resumes | Cover letters | Templates.
- Resumes reuse `/api/resumes` (+ `GET /api/resumes/[id]/file`). PDF uploads use Vinyaas `FileUpload`.
- Cover letters / templates in `.data/app.db` (`cover_letters`, `templates`); archive-not-delete.

## Job tracker (local v1)

- `/job-tracker`: Kanban + list, Active / Archived scopes.
- Applications in `.data/app.db` (`applications` table). `job_id` nullable; required snapshot: company, role, location.
- Single status enum (no custom statuses). Column show/hide + view prefs in `user_preferences`.
- Status changes only via user (drag or select) — Aavedak never auto-moves cards.

## Onboarding & resumes (local v1)

- New Google users land on `/onboarding` (`newUserCallbackURL`).
- Gate: authenticated users need ≥1 non-archived PDF resume before `/dashboard` and other app routes.
- Resume PDFs store in Google Cloud Storage (`GCS_BUCKET`); metadata in Neon Postgres `resumes.storage_path` (object key).
- Delete = archive only. Display names unique per user. Status: `active` | `inactive` | `archived`.
- Username = email local-part with collision suffix, stored in `profiles` table for `/{username}` links.

## Theme (FOUC)

Theme preference is stored in both `localStorage` and the `aavedak-theme` cookie (`light` | `dark` | `system`). The root layout reads the cookie on the server so `<html class="dark">` and `color-scheme` match on first paint. A blocking inline script in `<head>` is the client backup. Dark is the brand default when preference is unknown.

Hydration warnings mentioning `data-gr-ext-installed` / `data-new-gr-c-s-check-loaded` come from browser extensions (e.g. Grammarly), not the app — `<html>` and `<body>` use `suppressHydrationWarning` for that.

## Dev notes

If styles vanish after `pnpm build` while `next dev` is running, stop the dev server, `rm -rf apps/web/.next`, and start `pnpm --filter web dev` again. A production build overwrites `.next` and breaks the live CSS URLs.
