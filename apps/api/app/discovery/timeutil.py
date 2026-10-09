"""Time helpers. All persisted timestamps are ISO-8601 UTC strings ending in `Z`, so
plain string comparison in SQL orders them correctly (same convention as apps/web)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(dt: datetime) -> str:
    """Match JS `Date.prototype.toISOString()` (millisecond precision, `Z`)."""
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def now_iso() -> str:
    return to_iso(utcnow())


def parse_datetime(value: object) -> datetime | None:
    """Parse ISO strings, epoch milliseconds/seconds, or `YYYY-MM-DD`. Naive → UTC."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        seconds = value / 1000 if value > 1e11 else value
        try:
            return datetime.fromtimestamp(seconds, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if text.isdigit():
        return parse_datetime(int(text))
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def clamp_posted_at(value: object, now: datetime | None = None) -> str | None:
    """Posting date as ISO, or None when missing, unparseable, or in the future
    (the caller then falls back to first-seen and flags the date as estimated)."""
    dt = parse_datetime(value)
    if dt is None:
        return None
    now = now or utcnow()
    if dt > now + timedelta(hours=12):
        return None
    if dt.year < 2000:
        return None
    return to_iso(dt)


def ist_day_start_iso(now: datetime | None = None) -> str:
    now = now or utcnow()
    local = now.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    return to_iso(local)


def ist_date_key(now: datetime | None = None) -> str:
    now = now or utcnow()
    return now.astimezone(IST).strftime("%Y-%m-%d")


def expiry_cutoff_iso(expiry_days: int, now: datetime | None = None) -> str:
    now = now or utcnow()
    return to_iso(now - timedelta(days=expiry_days))


def iso_minus(seconds: float, now: datetime | None = None) -> str:
    now = now or utcnow()
    return to_iso(now - timedelta(seconds=seconds))


def iso_plus(seconds: float, now: datetime | None = None) -> str:
    now = now or utcnow()
    return to_iso(now + timedelta(seconds=seconds))
