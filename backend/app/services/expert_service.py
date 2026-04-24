from __future__ import annotations

import re
from time import time
from typing import Any

from backend.app.cache import runtime_cache
from backend.app.lotteries import normalize_lottery_code
from backend.app.repositories.expert_repository import ExpertRepository
from backend.app.repositories.model_repository import ModelRepository


FRONT_WEIGHT_KEYS = ["any3", "dan2", "dan1", "prime_composite_ratio", "big_small_ratio"]
BACK_WEIGHT_KEYS = ["quad_zone", "any2", "big_small"]
STRATEGY_WEIGHT_KEYS = ["miss_rebound", "hot_cold_pattern", "trend_deviation", "stability"]
PL3_RESERVED_KEYS = ["hundreds", "tens", "units"]


class ExpertService:
    def __init__(
        self,
        repository: ExpertRepository | None = None,
        model_repository: ModelRepository | None = None,
    ) -> None:
        self.repository = repository or ExpertRepository()
        self.model_repository = model_repository or ModelRepository()

    def list_experts(self, *, include_deleted: bool = False, lottery_code: str | None = None) -> list[dict[str, Any]]:
        self._ensure_seed_expert()
        normalized_lottery = normalize_lottery_code(lottery_code) if lottery_code else None
        cache_key = f"experts:list:{int(include_deleted)}:{normalized_lottery or '-'}"
        return runtime_cache.get_or_set(
            cache_key,
            ttl_seconds=60,
            loader=lambda: self.repository.list_experts(include_deleted=include_deleted, lottery_code=normalized_lottery),
        )

    def get_expert(self, expert_code: str) -> dict[str, Any] | None:
        self._ensure_seed_expert()
        cache_key = f"experts:detail:{str(expert_code).strip()}"
        return runtime_cache.get_or_set(
            cache_key,
            ttl_seconds=60,
            loader=lambda: self.repository.get_expert(str(expert_code).strip()),
        )

    def create_expert(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_payload(payload, is_create=True)
        created = self.repository.create_expert(normalized)
        self._invalidate_cache(expert_code=str(created.get("expert_code") or ""))
        return created

    def update_expert(self, expert_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_payload(payload, is_create=False, original_expert_code=expert_code)
        updated = self.repository.update_expert(str(expert_code).strip(), normalized)
        self._invalidate_cache(expert_code=str(expert_code).strip())
        if str(updated.get("expert_code") or "") != str(expert_code).strip():
            self._invalidate_cache(expert_code=str(updated.get("expert_code") or ""))
        return updated

    def set_expert_active(self, expert_code: str, is_active: bool) -> dict[str, Any]:
        updated = self.repository.set_expert_active(str(expert_code).strip(), bool(is_active))
        self._invalidate_cache(expert_code=str(expert_code).strip())
        return updated

    def delete_expert(self, expert_code: str) -> dict[str, Any]:
        deleted = self.repository.soft_delete_expert(str(expert_code).strip())
        self._invalidate_cache(expert_code=str(expert_code).strip())
        return deleted

    def restore_expert(self, expert_code: str) -> dict[str, Any]:
        restored = self.repository.restore_expert(str(expert_code).strip())
        self._invalidate_cache(expert_code=str(expert_code).strip())
        return restored

    @staticmethod
    def _build_default_weight_map(keys: list[str]) -> dict[str, int]:
        return {key: 0 for key in keys}

    def _normalize_payload(self, payload: dict[str, Any], *, is_create: bool, original_expert_code: str | None = None) -> dict[str, Any]:
        display_name = str(payload.get("display_name") or "").strip()
        if not display_name:
            raise ValueError("专家名称不能为空")
        if is_create:
            expert_code = self._build_unique_expert_code(display_name)
        else:
            expert_code = str(original_expert_code or "").strip().lower()
            if not expert_code:
                raise ValueError("专家编码不能为空")
        model_code = str(payload.get("model_code") or "").strip()
        if not model_code:
            raise ValueError("底层模型不能为空")
        model = self.model_repository.get_model(model_code)
        if not model or bool(model.get("is_deleted")) or not bool(model.get("is_active")):
            raise ValueError("底层模型不存在或未启用")
        lottery_code = normalize_lottery_code(payload.get("lottery_code") or "dlt")
        if lottery_code != "dlt":
            raise ValueError("专家预测首版仅支持大乐透")
        config_payload = payload.get("config")
        config = config_payload if isinstance(config_payload, dict) else {}
        normalized_config = self._normalize_config(config)
        return {
            "expert_code": expert_code,
            "display_name": display_name,
            "bio": str(payload.get("bio") or "").strip(),
            "model_code": model_code,
            "lottery_code": lottery_code,
            "history_window_count": 50,
            "is_active": bool(payload.get("is_active", True if is_create else False)),
            "config": normalized_config,
        }

    def _normalize_config(self, config: dict[str, Any]) -> dict[str, Any]:
        front = self._normalize_weight_group(config.get("dlt_front_weights"), FRONT_WEIGHT_KEYS, "大乐透前区权重")
        back = self._normalize_weight_group(config.get("dlt_back_weights"), BACK_WEIGHT_KEYS, "大乐透后区权重")
        strategy = self._normalize_weight_group(config.get("strategy_preferences"), STRATEGY_WEIGHT_KEYS, "策略倾向")
        pl3_reserved = self._normalize_reserved_group(config.get("pl3_reserved_weights"))
        return {
            "dlt_front_weights": front,
            "dlt_back_weights": back,
            "strategy_preferences": strategy,
            "pl3_reserved_weights": pl3_reserved,
        }

    def _normalize_weight_group(self, raw: Any, keys: list[str], label: str) -> dict[str, int]:
        source = raw if isinstance(raw, dict) else {}
        result = self._build_default_weight_map(keys)
        for key in keys:
            value = source.get(key, 0)
            try:
                number = int(value)
            except (TypeError, ValueError):
                raise ValueError(f"{label}字段 {key} 必须是数字") from None
            if number < 0 or number > 100:
                raise ValueError(f"{label}字段 {key} 必须在 0-100 之间")
            result[key] = number
        if sum(result.values()) != 100:
            raise ValueError(f"{label}权重总和必须等于100")
        return result

    def _normalize_reserved_group(self, raw: Any) -> dict[str, int]:
        source = raw if isinstance(raw, dict) else {}
        result = self._build_default_weight_map(PL3_RESERVED_KEYS)
        for key in PL3_RESERVED_KEYS:
            value = source.get(key, 0)
            try:
                number = int(value)
            except (TypeError, ValueError):
                raise ValueError(f"PL3预留字段 {key} 必须是数字") from None
            if number < 0 or number > 100:
                raise ValueError(f"PL3预留字段 {key} 必须在 0-100 之间")
            result[key] = number
        return result

    def _build_expert_code(self, display_name: str) -> str:
        normalized = re.sub(r"[^a-z0-9_-]+", "-", display_name.lower()).strip("-_")
        compact = re.sub(r"-{2,}", "-", normalized).strip("-_")
        if len(compact) >= 3:
            return compact[:64]
        return f"expert-{int(time())}"

    def _build_unique_expert_code(self, display_name: str) -> str:
        base_code = self._build_expert_code(display_name)
        if len(base_code) < 3:
            base_code = f"expert-{int(time())}"
        candidate = base_code
        suffix = 2
        while self.repository.get_expert(candidate):
            suffix_token = f"-{suffix}"
            max_base_len = 64 - len(suffix_token)
            trimmed_base = base_code[:max_base_len].rstrip("-_")
            candidate = f"{trimmed_base}{suffix_token}" if trimmed_base else f"expert{suffix_token}"
            suffix += 1
        return candidate

    def _ensure_seed_expert(self) -> None:
        if runtime_cache.get("experts:seeded:v1"):
            return
        existing = self.repository.list_experts(include_deleted=True)
        if existing:
            runtime_cache.set("experts:seeded:v1", True, ttl_seconds=3600)
            return
        seed_model_candidates = ["deepseek-v3.2", "deepseek-chat", "claude-sonnet-4.6"]
        selected_model_code = ""
        for model_code in seed_model_candidates:
            model = self.model_repository.get_model(model_code)
            if model and not bool(model.get("is_deleted")) and bool(model.get("is_active")):
                selected_model_code = str(model.get("model_code") or model_code)
                break
        if not selected_model_code:
            runtime_cache.set("experts:seeded:v1", True, ttl_seconds=300)
            return
        self.repository.create_expert(
            {
                "expert_code": "wei-rong-jie",
                "display_name": "魏荣杰",
                "bio": "数字彩 AI 专家，擅长结合遗漏、偏差与结构形态做稳健筛选。",
                "model_code": selected_model_code,
                "lottery_code": "dlt",
                "history_window_count": 50,
                "is_active": True,
                "config": {
                    "dlt_front_weights": {
                        "any3": 19,
                        "dan2": 28,
                        "dan1": 13,
                        "prime_composite_ratio": 25,
                        "big_small_ratio": 15,
                    },
                    "dlt_back_weights": {
                        "quad_zone": 37,
                        "any2": 46,
                        "big_small": 17,
                    },
                    "strategy_preferences": {
                        "miss_rebound": 41,
                        "hot_cold_pattern": 27,
                        "trend_deviation": 32,
                        "stability": 0,
                    },
                    "pl3_reserved_weights": {
                        "hundreds": 34,
                        "tens": 33,
                        "units": 33,
                    },
                },
            }
        )
        runtime_cache.set("experts:seeded:v1", True, ttl_seconds=3600)
        self._invalidate_cache()

    @staticmethod
    def _invalidate_cache(expert_code: str | None = None) -> None:
        runtime_cache.invalidate_prefix("experts:list:")
        runtime_cache.invalidate_prefix("experts:public:")
        if expert_code:
            runtime_cache.delete(f"experts:detail:{expert_code}")
        else:
            runtime_cache.invalidate_prefix("experts:detail:")
