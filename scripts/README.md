# Scripts

## `setup.sh`

One-shot bootstrap for a fresh clone (macOS + Linux):

```bash
./scripts/setup.sh
# or: bash scripts/setup.sh
# or: pnpm setup
```

It will:

1. Check Node (prefer ≥20), pnpm (enable via Corepack if missing), and Python 3
2. Run `pnpm install` at the repo root
3. Create `apps/api/.venv` if needed and install `requirements.txt` (+ `requirements-dev.txt`)
4. Copy env examples when `.env` / `.env.local` are missing; warn about placeholders
5. Print next commands for web + API

No network beyond package installs. Fails fast with clear messages (no stack dumps).

## Env rules for future generators

When adding codegen, seed, or other scripts:

1. Load env from the **correct app file** (`apps/web/.env.local` / `.env` or `apps/api/.env`).
2. Never read web secrets for API tasks or vice versa.
3. Fail clearly if required vars are missing.
