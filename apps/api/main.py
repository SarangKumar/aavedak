"""Vercel FastAPI entrypoint — `entrypoint: "main:app"` in vercel.json."""

from app.main import app

__all__ = ["app"]
