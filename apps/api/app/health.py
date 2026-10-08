"""Dependency health probes for GET /svc/health."""

from __future__ import annotations

import time
from typing import Any

from app.core.config import settings


def _check_backend() -> dict[str, Any]:
    return {"ok": True, "service": "api"}


def _check_google() -> dict[str, Any]:
    configured = bool(settings.google_client_id.strip() and settings.google_client_secret.strip())
    if not configured:
        return {
            "ok": False,
            "configured": False,
            "error": "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set",
        }
    return {"ok": True, "configured": True, "provider": "google"}


def _check_better_auth() -> dict[str, Any]:
    secret = settings.better_auth_secret.strip()
    url = settings.better_auth_url.strip() or settings.public_base_url.strip()
    if len(secret) < 32:
        return {
            "ok": False,
            "configured": False,
            "error": "BETTER_AUTH_SECRET missing or shorter than 32 characters",
        }
    if not url:
        return {
            "ok": False,
            "configured": False,
            "error": "BETTER_AUTH_URL / PUBLIC_BASE_URL not set",
        }
    return {"ok": True, "configured": True, "url": url}


def _check_database() -> dict[str, Any]:
    url = settings.database_url.strip()
    if not url:
        return {"ok": False, "configured": False, "error": "DATABASE_URL not set"}

    started = time.perf_counter()
    try:
        import psycopg

        with psycopg.connect(url, connect_timeout=5) as conn:
            conn.execute("SELECT 1")
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return {"ok": True, "configured": True, "latencyMs": latency_ms}
    except Exception as exc:  # noqa: BLE001 — surface any probe failure
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return {
            "ok": False,
            "configured": True,
            "latencyMs": latency_ms,
            "error": str(exc)[:240],
        }


def build_health_report() -> dict[str, Any]:
    checks = {
        "backend": _check_backend(),
        "google": _check_google(),
        "betterAuth": _check_better_auth(),
        "database": _check_database(),
    }
    ok = all(bool(c.get("ok")) for c in checks.values())
    return {
        "ok": ok,
        "service": "api",
        "checks": checks,
    }
