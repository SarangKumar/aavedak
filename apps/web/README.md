# Avsar Web

Next.js (App Router) + TypeScript + Tailwind CSS v4 front end for Avsar — the personal job-search OS.

**Philosophy:** Avsar recommends and prepares. The user decides and sends.

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

Copy `apps/web/.env.example` → `apps/web/.env.local` (or run `pnpm setup`).

| Variable                                    | Required for local UI | Notes                                                            |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`                       | Yes                   | Default `http://127.0.0.1:8000`                                  |
| `BETTER_AUTH_SECRET`                        | Yes for auth          | 32+ chars; `setup` / scaffold generates one if empty             |
| `BETTER_AUTH_URL`                           | Yes for auth          | `http://localhost:3000` locally                                  |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For Google sign-in    | Leave empty → `/sign-in` shows setup help (build still succeeds) |
| `AUTH_DATABASE_URL`                         | No (local)            | Reserved for production MySQL; local uses SQLite `data/local.db` |
| `ADMIN_EMAILS`                              | No                    | Comma-separated                                                  |

Never commit secrets. `apps/web/data/` (SQLite file) is gitignored.

## Auth (Better Auth + Google)

Frozen stack: **Better Auth** with **Google OAuth only** (no email/password).

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client (Web).
2. Authorized redirect URI:
   `http://localhost:3000/api/auth/callback/google`
3. Put Client ID / Secret in `apps/web/.env.local` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. Ensure `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=http://localhost:3000` are set.
5. From `apps/web` (first time / schema change): `pnpm dlx auth@latest migrate`
6. `pnpm --filter web dev` → open `/sign-in` → Continue with Google.

Local DB: SQLite via Better Auth (Kysely + `better-sqlite3`) at `apps/web/data/local.db`. Production will swap to MySQL (Aiven) using `AUTH_DATABASE_URL` — see comments in `lib/auth.ts`.

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

## Dev notes

If styles vanish after `pnpm build` while `next dev` is running, stop the dev server, `rm -rf apps/web/.next`, and start `pnpm --filter web dev` again. A production build overwrites `.next` and breaks the live CSS URLs.
