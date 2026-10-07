import logging
import time

from fastapi import FastAPI, Request

from app.core.config import settings
from app.core.logging import setup_logging

setup_logging(settings.log_level)
logger = logging.getLogger("avsar.api")

app = FastAPI(title="Avsar API", version="0.0.0")


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


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/v1/me")
def me_stub():
    """Placeholder — auth later. Prefer JSON bodies on mutating routes."""
    return {"status": "unimplemented"}
