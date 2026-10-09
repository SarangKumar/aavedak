"""Postgres (Neon) access for the discovery pipeline.

One short-lived connection per request/tick. Prepared statements are disabled so the
Neon pooled (PgBouncer) URL works. Callers group writes with `conn.transaction()`.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from app.discovery.config import get_settings


class DatabaseNotConfigured(RuntimeError):
    pass


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    url = get_settings().database_url.strip()
    if not url:
        raise DatabaseNotConfigured("DATABASE_URL is not set for the API service.")
    conn = psycopg.connect(
        url,
        autocommit=True,
        row_factory=dict_row,
        prepare_threshold=None,
        connect_timeout=10,
    )
    try:
        yield conn
    finally:
        conn.close()


def new_id() -> str:
    return str(uuid.uuid4())
