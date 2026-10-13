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
4. Copy the root `.env.example` to `.env` when missing; warn about placeholders and legacy per-app env files
5. Print next commands for web + API

No network beyond package installs. Fails fast with clear messages (no stack dumps).

## Env rules for future generators

When adding codegen, seed, or other scripts:

1. Load env from the repo-root `.env.local` then `.env`, never overriding variables already set.
2. Only read the keys the script needs.
3. Fail clearly if required vars are missing.
