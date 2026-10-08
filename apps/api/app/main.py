import logging
import time

from fastapi import APIRouter, FastAPI, Request

from app.core.config import settings
from app.core.logging import setup_logging

setup_logging(settings.log_level)
logger = logging.getLogger("aavedak.api")

# Public prefix on the shared Vercel domain (see root vercel.json → /svc/* → api service).
# Vercel Services forward the original path, so routes must include /svc.
API_PREFIX = "/svc"

app = FastAPI(title="Aavedak API", version="0.1.0")
router = APIRouter(prefix=API_PREFIX)


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


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/v1/me")
def me_stub():
    """Placeholder — auth later. Prefer JSON bodies on mutating routes."""
    return {"status": "unimplemented"}


app.include_router(router)
