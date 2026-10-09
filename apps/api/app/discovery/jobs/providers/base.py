"""Provider contract + shared HTTP helpers.

A provider turns one registry target into `RawPosting`s. `fetch()` does I/O; `parse()`
is pure (fixture-testable). Providers only use documented public posting APIs or the
public career page's schema.org JSON-LD — never authenticated or bot-protected endpoints.
"""

from __future__ import annotations

from typing import Any, Protocol

import httpx

from app.discovery.config import get_settings
from app.discovery.jobs.models import FetchResult, SourceTarget


class ProviderError(RuntimeError):
    """Expected, reportable failure (bad token, HTTP error, unparseable payload).
    `retryable=False` means retrying the same target later in this run cannot help."""

    def __init__(self, message: str, *, retryable: bool = True) -> None:
        super().__init__(message)
        self.retryable = retryable


class Provider(Protocol):
    key: str

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult: ...


def make_client() -> httpx.Client:
    settings = get_settings()
    return httpx.Client(
        timeout=httpx.Timeout(settings.discovery_http_timeout_seconds, connect=10.0),
        headers={"User-Agent": settings.discovery_user_agent, "Accept": "application/json"},
        follow_redirects=True,
    )


def get_json(client: httpx.Client, url: str, params: dict[str, Any] | None = None) -> Any:
    try:
        response = client.get(url, params=params)
    except httpx.HTTPError as exc:
        raise ProviderError(f"Request failed: {exc.__class__.__name__}") from exc
    if response.status_code == 404:
        raise ProviderError("Board not found (404) — check the token.", retryable=False)
    if response.status_code == 429:
        raise ProviderError("Rate limited (429).")
    if response.status_code >= 400:
        raise ProviderError(f"HTTP {response.status_code}.")
    try:
        return response.json()
    except ValueError as exc:
        raise ProviderError("Response was not JSON.") from exc


def get_text(client: httpx.Client, url: str) -> str:
    try:
        response = client.get(url, headers={"Accept": "text/html,application/xhtml+xml"})
    except httpx.HTTPError as exc:
        raise ProviderError(f"Request failed: {exc.__class__.__name__}") from exc
    if response.status_code >= 400:
        raise ProviderError(f"HTTP {response.status_code}.")
    return response.text


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def text_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
