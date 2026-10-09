#!/usr/bin/env bash
# Run the web app and the FastAPI scoring service together, so every ATS engine
# (including the open-source ones, which have no offline fallback) works locally.
# Web-only: `pnpm dev:web`. API-only: `pnpm dev:api`.
set -euo pipefail
cd "$(dirname "$0")/.."

API_DIR="apps/api"
if [ ! -x "$API_DIR/.venv/bin/python" ]; then
  echo "⚠  $API_DIR/.venv not found — run 'pnpm setup' first. Starting web only." >&2
  exec pnpm --filter web dev
fi

cleanup() { [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

( cd "$API_DIR" && exec .venv/bin/python -m uvicorn main:app --reload --port "${API_PORT:-8000}" ) &
API_PID=$!

echo "▸ FastAPI on :${API_PORT:-8000} (pid $API_PID) · Next on :3000"
pnpm --filter web dev
