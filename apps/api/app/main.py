import logging
import time

from fastapi import FastAPI, Request, Response

from app.ats.router import router as ats_router
from app.discovery.router import router as discovery_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.health import build_health_report

setup_logging(settings.log_level)
logger = logging.getLogger("aavedak.api")

# Vercel Services keep the original public path (see vercel/examples services/nextjs-fastapi).
# Public mount: /svc/* → api service. Local uvicorn uses the same paths.
app = FastAPI(
    title="Aavedak API",
    version="0.1.0",
    description="FastAPI service mounted under /svc on Vercel Services",
)
app.include_router(ats_router)
app.include_router(discovery_router)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    logger.info(
        "%s %s -> %s (%sms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.get("/svc/health")
def health(response: Response):
    """
    Aggregate health for backend, Google OAuth, Better Auth, and Postgres.

    Example:
    {
      "ok": true,
      "service": "api",
      "checks": {
        "backend": { "ok": true, "service": "api" },
        "google": { "ok": true, "configured": true, "provider": "google" },
        "betterAuth": { "ok": true, "configured": true, "url": "…" },
        "database": { "ok": true, "configured": true, "latencyMs": 12.3 }
      }
    }
    """
    report = build_health_report()
    response.status_code = 200 if report["ok"] else 503
    return report


@app.get("/svc/v1/me")
def me_stub():
    """Placeholder — auth later. Prefer JSON bodies on mutating routes."""
    return {"status": "unimplemented"}
