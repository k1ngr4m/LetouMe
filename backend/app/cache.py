from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from time import monotonic
from typing import Callable, Generic, TypeVar


T = TypeVar("T")


@dataclass
class _CacheEntry(Generic[T]):
    expires_at: float
    value: T


class TTLCache:
    def __init__(self) -> None:
        self._entries: dict[str, _CacheEntry[object]] = {}
        self._lock = Lock()

    def get(self, key: str) -> object | None:
        with self._lock:
            entry = self._entries.get(key)
            if not entry:
                return None
            if entry.expires_at <= monotonic():
                self._entries.pop(key, None)
                return None
            return entry.value

    def set(self, key: str, value: object, ttl_seconds: float) -> object:
        with self._lock:
            self._entries[key] = _CacheEntry(expires_at=monotonic() + ttl_seconds, value=value)
        return value

    def get_or_set(self, key: str, ttl_seconds: float, loader: Callable[[], T]) -> T:
        cached = self.get(key)
        if cached is not None:
            return cached  # type: ignore[return-value]
        value = loader()
        self.set(key, value, ttl_seconds)
        return value

    def delete(self, key: str) -> None:
        with self._lock:
            self._entries.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> None:
        with self._lock:
            keys = [key for key in self._entries if key.startswith(prefix)]
            for key in keys:
                self._entries.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


runtime_cache = TTLCache()
