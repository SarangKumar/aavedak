#!/usr/bin/env bash
# Avsar monorepo bootstrap — macOS + Linux
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- colors ( sparingly ) ---
if [[ -t 1 ]]; then
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[0;33m'
  RED=$'\033[0;31m'
  BOLD=$'\033[1m'
  RESET=$'\033[0m'
else
  GREEN=""; YELLOW=""; RED=""; BOLD=""; RESET=""
fi

ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
err()  { printf '%s✗%s %s\n' "$RED" "$RESET" "$*" >&2; }
die()  { err "$*"; exit 1; }

section() { printf '\n%s%s%s\n' "$BOLD" "$*" "$RESET"; }

# --- helpers ---
have() { command -v "$1" >/dev/null 2>&1; }

node_major() {
  local v
  v="$(node -v 2>/dev/null | sed 's/^v//')"
  echo "${v%%.*}"
}

pick_python() {
  # Prefer stable 3.12 for FastAPI ecosystem, then nearby minors, then unversioned.
  local c
  for c in python3.12 python3.13 python3.11 python3.14 python3; do
    if have "$c"; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

python_version_ok() {
  local py="$1"
  "$py" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null
}

ensure_env_key() {
  # ensure_env_key FILE KEY  — key must exist as a line KEY=...
  local file="$1" key="$2"
  if ! grep -qE "^${key}=" "$file" 2>/dev/null; then
    echo "${key}=" >>"$file"
    warn "Added missing key ${key}= to $(basename "$(dirname "$file")")/$(basename "$file")"
  fi
}

copy_env_if_missing() {
  local example="$1" dest="$2" label="$3"
  if [[ -f "$dest" ]]; then
    ok "$label already exists ($(basename "$dest"))"
    return 0
  fi
  if [[ ! -f "$example" ]]; then
    die "Missing example env: $example"
  fi
  cp "$example" "$dest"
  warn "Created $dest from $(basename "$example") — fill in secrets as needed"
}

# --- start ---
section "Avsar setup"
printf 'Repo: %s\n' "$ROOT"

# Node
section "Checking Node"
if ! have node; then
  die "Node.js not found. Install Node 20+ from https://nodejs.org and re-run."
fi
NODE_VER="$(node -v)"
ok "node $NODE_VER"
MAJOR="$(node_major)"
if [[ -n "$MAJOR" && "$MAJOR" -lt 20 ]]; then
  warn "Node $NODE_VER detected; Node 20+ is recommended (continuing anyway)"
fi

# pnpm
section "Checking pnpm"
PNPM_WANTED="12.6.0"
if have pnpm; then
  ok "pnpm $(pnpm -v)"
else
  if have corepack; then
    warn "pnpm not found — enabling via Corepack ($PNPM_WANTED)"
    corepack enable || die "corepack enable failed"
    corepack prepare "pnpm@${PNPM_WANTED}" --activate || die "corepack prepare pnpm failed"
    have pnpm || die "pnpm still not on PATH after Corepack"
    ok "pnpm $(pnpm -v) (via Corepack)"
  else
    die "pnpm not found and Corepack unavailable. Install pnpm 12: https://pnpm.io/installation"
  fi
fi

# Python
section "Checking Python"
PY="$(pick_python)" || die "python3 not found. Install Python 3.11+ and re-run."
PY_VER="$("$PY" -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')"
if python_version_ok "$PY"; then
  ok "$PY $PY_VER"
else
  warn "$PY $PY_VER — Python 3.11+ preferred (continuing with this interpreter)"
fi

# JS install
section "Installing JavaScript dependencies"
pnpm install || die "pnpm install failed"
ok "pnpm install complete"

# API venv
section "Setting up API virtualenv"
API_DIR="$ROOT/apps/api"
VENV="$API_DIR/.venv"
RECREATE_VENV=0
if [[ ! -d "$VENV" ]]; then
  RECREATE_VENV=1
else
  # Recreate if below 3.11, or if 3.12 is available but venv is not 3.12
  VENV_PY="$VENV/bin/python"
  if [[ ! -x "$VENV_PY" ]]; then
    warn "Existing venv missing interpreter — recreating"
    RECREATE_VENV=1
  elif ! "$VENV_PY" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
    warn "Existing venv is below Python 3.11 — recreating with $PY"
    RECREATE_VENV=1
  elif have python3.12; then
    if ! "$VENV_PY" -c 'import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)' 2>/dev/null; then
      warn "Python 3.12 available but venv is not 3.12 — recreating with $PY"
      RECREATE_VENV=1
    fi
  fi
fi

if [[ "$RECREATE_VENV" -eq 1 ]]; then
  rm -rf "$VENV"
  "$PY" -m venv "$VENV" || die "Failed to create $VENV"
  ok "Created $VENV with $PY"
else
  ok "Using existing $VENV ($("$VENV/bin/python" -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])'))"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install --upgrade pip >/dev/null 2>&1 || warn "pip upgrade skipped"
pip install -r "$API_DIR/requirements.txt" || die "pip install requirements.txt failed"
if [[ -f "$API_DIR/requirements-dev.txt" ]]; then
  pip install -r "$API_DIR/requirements-dev.txt" || die "pip install requirements-dev.txt failed"
fi
ok "API Python packages installed"
deactivate 2>/dev/null || true

# Env files
section "Environment files"
WEB_DIR="$ROOT/apps/web"
copy_env_if_missing "$WEB_DIR/.env.example" "$WEB_DIR/.env.local" "Web env"
# Prefer .env.local; also allow .env if user created it instead
WEB_ENV=""
if [[ -f "$WEB_DIR/.env.local" ]]; then
  WEB_ENV="$WEB_DIR/.env.local"
elif [[ -f "$WEB_DIR/.env" ]]; then
  WEB_ENV="$WEB_DIR/.env"
fi
if [[ -n "$WEB_ENV" ]]; then
  ensure_env_key "$WEB_ENV" "NEXT_PUBLIC_APP_URL"
  ensure_env_key "$WEB_ENV" "NEXT_PUBLIC_API_URL"
  ensure_env_key "$WEB_ENV" "BETTER_AUTH_SECRET"
  ensure_env_key "$WEB_ENV" "BETTER_AUTH_URL"
  ensure_env_key "$WEB_ENV" "GOOGLE_CLIENT_ID"
  ensure_env_key "$WEB_ENV" "GOOGLE_CLIENT_SECRET"
  ensure_env_key "$WEB_ENV" "AUTH_DATABASE_URL"
  ensure_env_key "$WEB_ENV" "ADMIN_EMAILS"
  if grep -qE '^NEXT_PUBLIC_API_URL=.+' "$WEB_ENV"; then
    ok "NEXT_PUBLIC_API_URL is set (required for local web → API)"
  else
    warn "NEXT_PUBLIC_API_URL is empty — set it (e.g. http://127.0.0.1:8000) before relying on API calls"
  fi

  # Generate BETTER_AUTH_SECRET if empty so local auth boot works
  if grep -qE '^BETTER_AUTH_SECRET=$' "$WEB_ENV" 2>/dev/null; then
    SECRET="$(openssl rand -hex 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(32))')"
    # portable in-place replace
    tmp="$(mktemp)"
    sed "s/^BETTER_AUTH_SECRET=$/BETTER_AUTH_SECRET=${SECRET}/" "$WEB_ENV" >"$tmp" && mv "$tmp" "$WEB_ENV"
    ok "Generated BETTER_AUTH_SECRET for local auth"
  fi
  warn "Fill GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET for Google sign-in (see apps/web/README.md)"
fi

copy_env_if_missing "$API_DIR/.env.example" "$API_DIR/.env" "API env"
if [[ -f "$API_DIR/.env" ]]; then
  ensure_env_key "$API_DIR/.env" "LOG_LEVEL"
  ensure_env_key "$API_DIR/.env" "CRON_SECRET"
  ensure_env_key "$API_DIR/.env" "DATABASE_URL"
  ensure_env_key "$API_DIR/.env" "R2_ACCOUNT_ID"
  ensure_env_key "$API_DIR/.env" "R2_ACCESS_KEY_ID"
  ensure_env_key "$API_DIR/.env" "R2_SECRET_ACCESS_KEY"
  ensure_env_key "$API_DIR/.env" "R2_BUCKET"
  if grep -qE '^DATABASE_URL=.+' "$API_DIR/.env"; then
    ok "DATABASE_URL is set"
  else
    warn "DATABASE_URL is empty — API will start, but DB features will not work until you set it"
  fi
fi

# Sanity
section "Sanity checks"
if node -e "require('fs').accessSync('apps/web/package.json')" 2>/dev/null; then
  ok "Node can see apps/web/package.json"
else
  warn "Node path check skipped"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
if (cd "$API_DIR" && PYTHONPATH="$API_DIR" python -c "from app.main import app; print(app.title)") >/dev/null 2>&1; then
  ok "Python can import FastAPI app"
else
  warn "Could not import app.main — check venv and PYTHONPATH if API fails to start"
fi
deactivate 2>/dev/null || true

# Done
section "Ready"
printf '%sSetup complete.%s\n\n' "$GREEN" "$RESET"
cat <<EOF
Next steps:

  1. Web (Next.js):
       pnpm dev
       → http://localhost:3000

  2. API (FastAPI) — separate terminal:
       source apps/api/.venv/bin/activate
       cd apps/api && uvicorn app.main:app --reload --port 8000
       → http://127.0.0.1:8000/health

Fill secrets in apps/web/.env.local and apps/api/.env as you enable auth/DB.
See README.md and docs/ for product context.
EOF
