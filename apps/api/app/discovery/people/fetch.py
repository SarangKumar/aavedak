"""Polite HTTP for people discovery: one identified User-Agent, robots.txt for every web
page (not for documented APIs), a minimum gap between hits to one host, and a hard request
budget per company so one target can never run away. Never raises on network errors."""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

_TEXT_TYPES = ("text/html", "application/xhtml", "text/plain")


class Fetcher:
    def __init__(
        self,
        *,
        user_agent: str,
        budget: int,
        host_delay: float = 1.0,
        timeout: float = 10.0,
        client: httpx.Client | None = None,
    ) -> None:
        self.user_agent = user_agent
        self.budget = budget
        self.used = 0
        self.host_delay = host_delay
        self.blocked_hosts: set[str] = set()
        self.robots_denied = 0
        self.last_status: int | None = None
        self.last_headers: dict[str, str] | None = None
        self._robots: dict[str, RobotFileParser | None] = {}
        self._last_hit: dict[str, float] = {}
        self._own_client = client is None
        self.client = client or httpx.Client(
            timeout=httpx.Timeout(timeout, connect=5.0),
            headers={"User-Agent": user_agent},
            follow_redirects=True,
        )

    def close(self) -> None:
        if self._own_client:
            self.client.close()

    def __enter__(self) -> "Fetcher":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @property
    def exhausted(self) -> bool:
        return self.used >= self.budget

    def _pace(self, host: str) -> None:
        last = self._last_hit.get(host)
        if last is not None:
            wait = self.host_delay - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
        self._last_hit[host] = time.monotonic()

    def allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        if host not in self._robots:
            parser: RobotFileParser | None = None
            if not self.exhausted:
                self.used += 1
                self._pace(host)
                try:
                    resp = self.client.get(f"{parsed.scheme}://{host}/robots.txt")
                    if resp.status_code < 400:
                        parser = RobotFileParser()
                        parser.parse(resp.text.splitlines())
                    elif resp.status_code in (401, 403):
                        parser = RobotFileParser()
                        parser.disallow_all = True
                except httpx.HTTPError:
                    parser = None
            self._robots[host] = parser
        parser = self._robots[host]
        ok = parser is None or parser.can_fetch(self.user_agent, url)
        if not ok:
            self.robots_denied += 1
        return ok

    def page(self, url: str) -> tuple[str, str] | None:
        """(final url, html) of a public web page, robots.txt respected; else None."""
        if self.exhausted or not url.startswith(("http://", "https://")):
            return None
        host = urlparse(url).netloc.lower()
        if host in self.blocked_hosts or not self.allowed(url):
            return None
        resp = self._get(url, headers={"Accept": "text/html,application/xhtml+xml"})
        if resp is None or resp.status_code >= 400:
            return None
        ctype = resp.headers.get("content-type", "").lower()
        if ctype and not any(t in ctype for t in _TEXT_TYPES):
            return None
        return str(resp.url), resp.text[:2_000_000]

    def api(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        json: Any = None,
    ) -> Any | None:
        """JSON from a documented API (robots.txt does not apply to API endpoints)."""
        if self.exhausted:
            return None
        host = urlparse(url).netloc.lower()
        if host in self.blocked_hosts:
            return None
        resp = self._get(url, method=method, headers={"Accept": "application/json", **(headers or {})}, params=params, json=json)
        self.last_status = resp.status_code if resp is not None else None
        self.last_headers = {k.lower(): v for k, v in resp.headers.items()} if resp is not None else None
        if resp is None:
            return None
        if resp.status_code in (401, 403, 429):
            self.blocked_hosts.add(host)  # out of quota / bad key: stop using it this run
            return None
        if resp.status_code >= 400:
            return None
        try:
            return resp.json()
        except ValueError:
            return None

    def _get(self, url: str, *, method: str = "GET", **kwargs: Any) -> httpx.Response | None:
        self.used += 1
        self._pace(urlparse(url).netloc.lower())
        try:
            return self.client.request(method, url, **{k: v for k, v in kwargs.items() if v is not None})
        except (httpx.HTTPError, ValueError):
            return None
