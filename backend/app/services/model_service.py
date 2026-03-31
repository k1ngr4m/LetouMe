from __future__ import annotations

from datetime import datetime
from time import perf_counter
from typing import Any

from openai import OpenAI

from backend.app.cache import runtime_cache
from backend.app.lotteries import normalize_lottery_code
from backend.app.repositories.model_repository import ModelRepository
from backend.core.model_config import LMSTUDIO_BASE_URL, ModelDefinition
from backend.core.model_factory import ModelFactory


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
        normalized = self._normalize_payload(payload, is_create=True)
        if not normalized.get("model_code"):
            provider_code = str(normalized.get("provider") or "").strip()
            model_segment = str(normalized.get("api_model_name") or normalized.get("provider_model_name") or "").strip()
            normalized["model_code"] = self._build_model_code(provider_code, model_segment)
        created = self._serialize_model(self.repository.create_model(normalized))
        self._invalidate_model_cache()
        return created

    def update_model(self, model_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_payload(payload, is_create=False)
        if not normalized.get("model_code"):
            normalized["model_code"] = str(model_code or "").strip()
        updated = self._serialize_model(self.repository.update_model(model_code, normalized))
        updated_model_code = str(updated.get("model_code") or "").strip()
        self._invalidate_model_cache(model_code)
        if updated_model_code and updated_model_code != model_code:
            self._invalidate_model_cache(updated_model_code)
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

    def list_providers(self) -> list[dict[str, Any]]:
        return runtime_cache.get_or_set("models:providers", ttl_seconds=600, loader=self.repository.list_providers)

    def get_provider(self, provider_code: str) -> dict[str, Any] | None:
        return self.repository.get_provider(provider_code)

    def create_provider(self, payload: dict[str, Any]) -> dict[str, Any]:
        created = self.repository.create_provider(self._normalize_provider_payload(payload, is_create=True))
        self._invalidate_model_cache()
        return created

    def update_provider(self, provider_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        updated = self.repository.update_provider(provider_code, self._normalize_provider_payload(payload, is_create=False))
        self._invalidate_model_cache()
        return updated

    def delete_provider(self, provider_code: str) -> dict[str, Any]:
        deleted = self.repository.delete_provider(provider_code)
        self._invalidate_model_cache()
        return deleted

    def test_model_connectivity(self, payload: dict[str, Any]) -> dict[str, Any]:
        provider = str(payload.get("provider") or "").strip()
        api_model_name = str(payload.get("api_model_name") or "").strip()
        api_format = str(payload.get("api_format") or "").strip().lower() or None
        temperature = self._normalize_temperature(payload.get("temperature"))
        if not provider:
            raise ValueError("Provider cannot be empty")
        if not api_model_name:
            raise ValueError("API model name cannot be empty")

        started_at = perf_counter()
        model_definition = ModelDefinition(
            id=f"connectivity-test-{provider}-{api_model_name}",
            name="Connectivity Test",
            provider=provider,
            model_id=api_model_name,
            api_model=api_model_name,
            api_format=api_format,
            api_key_value=str(payload.get("api_key") or "").strip(),
            base_url_value=str(payload.get("base_url") or "").strip(),
            app_code_value=str(payload.get("app_code") or "").strip(),
            temperature=temperature,
        )
        model = ModelFactory().create(model_definition)
        ok, message = model.health_check()
        duration_ms = int((perf_counter() - started_at) * 1000)
        return {"ok": bool(ok), "message": str(message or ""), "duration_ms": max(duration_ms, 0)}

    def discover_provider_models(self, payload: dict[str, Any]) -> dict[str, Any]:
        provider = str(payload.get("provider") or "").strip().lower()
        if not provider:
            raise ValueError("Provider cannot be empty")

        client = self._build_openai_client(
            provider=provider,
            base_url=str(payload.get("base_url") or "").strip(),
            api_key=str(payload.get("api_key") or "").strip(),
        )
        response = client.models.list()
        data = getattr(response, "data", None) or []
        discovered: dict[str, dict[str, str]] = {}
        for item in data:
            model_id = str(getattr(item, "id", "") or "").strip()
            if not model_id:
                continue
            discovered[model_id] = {"model_id": model_id, "display_name": model_id}
        if not discovered:
            raise ValueError("No available models were found")
        return {"models": sorted(discovered.values(), key=lambda item: item["display_name"].lower())}

    def bulk_action(self, model_codes: list[str], action: str, updates: dict[str, Any] | None = None) -> dict[str, Any]:
        normalized_codes = [str(code).strip() for code in model_codes if str(code).strip()]
        unique_codes = list(dict.fromkeys(normalized_codes))
        if not unique_codes:
            raise ValueError("Please select at least one model")

        supported_actions = {"enable", "disable", "delete", "restore", "edit"}
        if action not in supported_actions:
            raise ValueError("Unsupported bulk action")

        summary = {
            "selected_count": len(unique_codes),
            "processed_count": 0,
            "skipped_count": 0,
            "failed_count": 0,
            "processed_models": [],
            "skipped_models": [],
            "failed_models": [],
        }

        normalized_updates = self._normalize_bulk_updates(updates or {}) if action == "edit" else {}
        if action == "edit" and not normalized_updates:
            raise ValueError("Please select at least one editable field")

        for model_code in unique_codes:
            model = self.get_model(model_code)
            if not model:
                summary["failed_count"] += 1
                summary["failed_models"].append(model_code)
                continue
            try:
                if action == "enable":
                    if model.get("is_deleted") or model.get("is_active"):
                        summary["skipped_count"] += 1
                        summary["skipped_models"].append(model_code)
                        continue
                    self.set_model_active(model_code, True)
                elif action == "disable":
                    if model.get("is_deleted") or not model.get("is_active"):
                        summary["skipped_count"] += 1
                        summary["skipped_models"].append(model_code)
                        continue
                    self.set_model_active(model_code, False)
                elif action == "delete":
                    if model.get("is_deleted"):
                        summary["skipped_count"] += 1
                        summary["skipped_models"].append(model_code)
                        continue
                    self.delete_model(model_code)
                elif action == "restore":
                    if not model.get("is_deleted"):
                        summary["skipped_count"] += 1
                        summary["skipped_models"].append(model_code)
                        continue
                    self.restore_model(model_code)
                else:
                    if model.get("is_deleted"):
                        summary["skipped_count"] += 1
                        summary["skipped_models"].append(model_code)
                        continue
                    merged_payload = {
                        **model,
                        **normalized_updates,
                    }
                    self.update_model(model_code, merged_payload)
                summary["processed_count"] += 1
                summary["processed_models"].append(model_code)
            except Exception:
                summary["failed_count"] += 1
                summary["failed_models"].append(model_code)

        self._invalidate_model_cache()
        return summary

    @staticmethod
    def _invalidate_model_cache(model_code: str | None = None) -> None:
        runtime_cache.invalidate_prefix("models:list:")
        runtime_cache.delete("models:providers")
        runtime_cache.invalidate_prefix("predictions:")
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
        normalized["model_code"] = str(payload.get("model_code") or "").strip()
        normalized["display_name"] = str(payload.get("display_name") or "").strip()
        normalized["provider"] = str(payload.get("provider") or "").strip()
        provider_model_id = payload.get("provider_model_id")
        normalized["provider_model_id"] = int(provider_model_id) if str(provider_model_id or "").strip() else None
        normalized["provider_model_name"] = str(payload.get("provider_model_name") or "").strip()
        api_format = str(payload.get("api_format") or "").strip().lower()
        normalized["api_format"] = api_format or None
        normalized["api_model_name"] = str(payload.get("api_model_name") or "").strip()
        normalized["base_url"] = str(payload.get("base_url") or "").strip()
        normalized["api_key"] = str(payload.get("api_key") or "").strip()
        normalized["app_code"] = str(payload.get("app_code") or "").strip()
        normalized["temperature"] = ModelService._normalize_temperature(payload.get("temperature"))
        normalized["lottery_codes"] = [
            normalize_lottery_code(str(item))
            for item in (payload.get("lottery_codes") or ["dlt"])
            if str(item).strip()
        ] or ["dlt"]
        normalized["is_active"] = bool(payload.get("is_active", True))
        return normalized

    @staticmethod
    def _normalize_temperature(value: Any) -> float:
        if value is None or str(value).strip() == "":
            return 0.3
        try:
            return float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("Temperature must be numeric") from exc

    @staticmethod
    def _normalize_provider_payload(payload: dict[str, Any], *, is_create: bool) -> dict[str, Any]:
        normalized = dict(payload)
        if is_create:
            normalized["code"] = str(payload.get("code") or "").strip()
        normalized["name"] = str(payload.get("name") or "").strip()
        normalized["api_format"] = str(payload.get("api_format") or "openai_compatible").strip().lower()
        normalized["remark"] = str(payload.get("remark") or "").strip()
        normalized["website_url"] = str(payload.get("website_url") or "").strip()
        normalized["api_key"] = str(payload.get("api_key") or "").strip()
        normalized["base_url"] = str(payload.get("base_url") or "").strip()
        normalized["extra_options"] = payload.get("extra_options") or {}
        normalized["model_configs"] = payload.get("model_configs") or []
        return normalized

    @staticmethod
    def _build_openai_client(*, provider: str, base_url: str, api_key: str) -> OpenAI:
        normalized_provider = str(provider or "").strip().lower()
        normalized_base_url = base_url or (LMSTUDIO_BASE_URL if normalized_provider == "lmstudio" else "")
        normalized_api_key = api_key or ("lm-studio" if normalized_provider == "lmstudio" else "")
        if not normalized_base_url:
            raise ValueError("Base URL cannot be empty")
        if not normalized_api_key and normalized_provider != "lmstudio":
            raise ValueError("API key cannot be empty")
        return OpenAI(api_key=normalized_api_key, base_url=normalized_base_url)

    @staticmethod
    def _build_model_code(provider_code: str, model_segment: str) -> str:
        base = f"{provider_code}-{model_segment}".strip("-").lower()
        cleaned = "".join(char if char.isalnum() or char in {"-", "_", "."} else "-" for char in base)
        while "--" in cleaned:
            cleaned = cleaned.replace("--", "-")
        return cleaned.strip("-")

    @staticmethod
    def _normalize_bulk_updates(payload: dict[str, Any]) -> dict[str, Any]:
        allowed_fields = {"provider", "base_url", "api_key", "lottery_codes", "is_active"}
        normalized: dict[str, Any] = {}
        for key in allowed_fields:
            if key not in payload:
                continue
            value = payload[key]
            if key in {"provider", "base_url", "api_key"}:
                normalized[key] = str(value or "").strip()
            elif key == "lottery_codes":
                normalized[key] = [
                    normalize_lottery_code(str(item))
                    for item in (value or [])
                    if str(item).strip()
                ] or ["dlt"]
            elif key == "is_active":
                normalized[key] = bool(value)
        return normalized


def _format_datetime(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")
    return str(value)
