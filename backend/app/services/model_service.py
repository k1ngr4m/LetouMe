from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.app.cache import runtime_cache
from backend.app.repositories.model_repository import ModelRepository


class ModelService:
    def __init__(self, repository: ModelRepository | None = None) -> None:
        self.repository = repository or ModelRepository()

    def list_models(self, include_deleted: bool = False) -> list[dict[str, Any]]:
        cache_key = f"models:list:{int(include_deleted)}"
        return runtime_cache.get_or_set(
            cache_key,
            ttl_seconds=120,
            loader=lambda: [self._serialize_model(model) for model in self.repository.list_models(include_deleted=include_deleted)],
        )

    def get_model(self, model_code: str) -> dict[str, Any] | None:
        cache_key = f"models:detail:{model_code}"
        model = runtime_cache.get_or_set(cache_key, ttl_seconds=120, loader=lambda: self.repository.get_model(model_code))
        return self._serialize_model(model) if model else None

    def create_model(self, payload: dict[str, Any]) -> dict[str, Any]:
        created = self._serialize_model(self.repository.create_model(self._normalize_payload(payload, is_create=True)))
        self._invalidate_model_cache()
        return created

    def update_model(self, model_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_payload(payload, is_create=False)
        normalized.pop("model_code", None)
        updated = self._serialize_model(self.repository.update_model(model_code, normalized))
        self._invalidate_model_cache(model_code)
        return updated

    def set_model_active(self, model_code: str, is_active: bool) -> dict[str, Any]:
        updated = self._serialize_model(self.repository.set_model_active(model_code, is_active))
        self._invalidate_model_cache(model_code)
        return updated

    def delete_model(self, model_code: str) -> dict[str, Any]:
        deleted = self._serialize_model(self.repository.soft_delete_model(model_code))
        self._invalidate_model_cache(model_code)
        return deleted

    def restore_model(self, model_code: str) -> dict[str, Any]:
        restored = self._serialize_model(self.repository.restore_model(model_code))
        self._invalidate_model_cache(model_code)
        return restored

    def list_providers(self) -> list[dict[str, str]]:
        return runtime_cache.get_or_set("models:providers", ttl_seconds=600, loader=self.repository.list_providers)

    @staticmethod
    def _invalidate_model_cache(model_code: str | None = None) -> None:
        runtime_cache.invalidate_prefix("models:list:")
        runtime_cache.delete("models:providers")
        if model_code:
            runtime_cache.delete(f"models:detail:{model_code}")
        else:
            runtime_cache.invalidate_prefix("models:detail:")

    @staticmethod
    def _serialize_model(model: dict[str, Any]) -> dict[str, Any]:
        return {
            **model,
            "updated_at": _format_datetime(model.get("updated_at")) or "",
        }

    @staticmethod
    def _normalize_payload(payload: dict[str, Any], *, is_create: bool) -> dict[str, Any]:
        normalized = dict(payload)
        if is_create:
            normalized["model_code"] = str(payload.get("model_code") or "").strip()
        normalized["display_name"] = str(payload.get("display_name") or "").strip()
        normalized["provider"] = str(payload.get("provider") or "").strip()
        normalized["api_model_name"] = str(payload.get("api_model_name") or "").strip()
        normalized["version"] = str(payload.get("version") or "").strip()
        normalized["base_url"] = str(payload.get("base_url") or "").strip()
        normalized["api_key"] = str(payload.get("api_key") or "").strip()
        normalized["app_code"] = str(payload.get("app_code") or "").strip()
        normalized["temperature"] = payload.get("temperature")
        normalized["tags"] = payload.get("tags") or []
        normalized["is_active"] = bool(payload.get("is_active", True))
        return normalized


def _format_datetime(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")
    return str(value)
