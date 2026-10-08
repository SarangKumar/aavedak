import logging
import time

from fastapi import FastAPI, Request

from app.core.config import settings
from app.core.logging import setup_logging

setup_logging(settings.log_level)
logger = logging.getLogger("aavedak.api")

# Vercel Services keep the original public path (see vercel/examples services/nextjs-fastapi).
# Public mount: /svc/* → api service. Local uvicorn uses the same paths.
app = FastAPI(
    title="Aavedak API",
    version="0.1.0",
    description="FastAPI service mounted under /svc on Vercel Services",
)


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
def health():
    return {"ok": True, "service": "api"}


@app.get("/svc/v1/me")
def me_stub():
    """Placeholder — auth later. Prefer JSON bodies on mutating routes."""
    return {"status": "unimplemented"}
