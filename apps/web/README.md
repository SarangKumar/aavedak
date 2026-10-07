# Avsar Web

Next.js (App Router) + TypeScript + Tailwind CSS v4 front end for Avsar — the personal job-search OS.

**Philosophy:** Avsar recommends and prepares. The user decides and sends.

## Routes

### App (no username prefix)

| Path           | Purpose                           |
| -------------- | --------------------------------- |
| `/`            | Landing                           |
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

Copy `apps/web/.env.example` → `apps/web/.env.local`.

| Variable                                    | Required for local UI | Notes                           |
| ------------------------------------------- | --------------------- | ------------------------------- |
| `NEXT_PUBLIC_API_URL`                       | Yes                   | Default `http://127.0.0.1:8000` |
| `BETTER_AUTH_SECRET`                        | No (until auth)       |                                 |
| `BETTER_AUTH_URL`                           | No                    | e.g. `http://localhost:3000`    |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No                    | OAuth later                     |
| `ADMIN_EMAILS`                              | No                    | Comma-separated                 |

Never commit secrets.

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
├── lib/utils.ts         # cn()
└── public/brand/icon.png
```
