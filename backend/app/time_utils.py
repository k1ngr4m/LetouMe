from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo


BEIJING_TIMEZONE = ZoneInfo("Asia/Shanghai")
UTC = timezone.utc

_DATETIME_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%d",
    "%Y/%m/%d",
)


def now_ts() -> int:
    return int(datetime.now(UTC).timestamp())


def beijing_now() -> datetime:
    return datetime.now(BEIJING_TIMEZONE)


def ensure_timestamp(value: Any, *, assume_beijing: bool = False) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, datetime):
        active = value
        if active.tzinfo is None:
            active = active.replace(tzinfo=BEIJING_TIMEZONE if assume_beijing else UTC)
        return int(active.astimezone(UTC).timestamp())
    if isinstance(value, date):
        return int(datetime.combine(value, time.min, tzinfo=BEIJING_TIMEZONE if assume_beijing else UTC).astimezone(UTC).timestamp())
    text = str(value).strip()
    if not text:
        return None
    if text.isdigit() or (text.startswith("-") and text[1:].isdigit()):
        return int(text)
    normalized = text.replace("Z", "+00:00") if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=BEIJING_TIMEZONE if assume_beijing else UTC)
        return int(parsed.astimezone(UTC).timestamp())
    except ValueError:
        pass
    for fmt in _DATETIME_FORMATS:
        try:
            parsed = datetime.strptime(text, fmt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=BEIJING_TIMEZONE if assume_beijing else UTC)
            return int(parsed.astimezone(UTC).timestamp())
        except ValueError:
            continue
    return None


def as_beijing_datetime(value: Any) -> datetime | None:
    timestamp = ensure_timestamp(value, assume_beijing=True)
    if timestamp is None:
        return None
    return datetime.fromtimestamp(timestamp, tz=UTC).astimezone(BEIJING_TIMEZONE)


def format_beijing_datetime(value: Any, *, with_seconds: bool = True) -> str | None:
    dt = as_beijing_datetime(value)
    if not dt:
        return None
    return dt.strftime("%Y-%m-%d %H:%M:%S" if with_seconds else "%Y-%m-%d %H:%M")


def beijing_date_start_ts(value: str | date | datetime | None) -> int | None:
    parsed = _parse_date_value(value)
    if not parsed:
        return None
    return int(datetime.combine(parsed, time.min, tzinfo=BEIJING_TIMEZONE).astimezone(UTC).timestamp())


def beijing_date_end_ts(value: str | date | datetime | None) -> int | None:
    parsed = _parse_date_value(value)
    if not parsed:
        return None
    end_of_day = datetime.combine(parsed, time(23, 59, 59), tzinfo=BEIJING_TIMEZONE)
    return int(end_of_day.astimezone(UTC).timestamp())


def _parse_date_value(value: str | date | datetime | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(BEIJING_TIMEZONE).date() if value.tzinfo else value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None
