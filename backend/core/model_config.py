# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from dataclasses import dataclass, field
from threading import Lock
from time import monotonic
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse

from backend.app.db.connection import ensure_schema, get_connection
from backend.app.lotteries import normalize_lottery_code


DEFAULT_BASE_URL = "https://aihubmix.com/v1"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
LMSTUDIO_BASE_URL = "http://127.0.0.1:1234/v1"
SUPPORTED_PROVIDERS = (
    "openai",
    "anthropic",
    "gemini",
    "deepseek",
    "lmstudio",
    "openai_compatible",
)
SUPPORTED_API_FORMATS = (
    "openai_responses",
    "openai_compatible",
    "anthropic",
    "amazon_bedrock",
    "google_gemini",
)
_bootstrap_ready = False
_bootstrap_lock = Lock()
_registry_cache_lock = Lock()
_registry_cache_entry: tuple[float, "ModelRegistry"] | None = None
MODEL_REGISTRY_CACHE_TTL_SECONDS = 60

DEFAULT_MODEL_CATALOG: list[dict[str, Any]] = [
    {
        "model_code": "gpt-4o",
        "display_name": "GPT-4o",
        "provider": "openai",
        "api_model_name": "gpt-4o",
        "version": "1",
        "tags": ["reasoning", "fast"],
        "is_active": False,
        "base_url": DEFAULT_BASE_URL,
        "api_key": "",
        "app_code": "",
        "lottery_codes": ["dlt"],
    },
    {
        "model_code": "claude-sonnet-4.6",
        "display_name": "Claude-4.6",
        "provider": "anthropic",
        "api_model_name": "claude-sonnet-4-6",
        "version": "1",
        "tags": ["reasoning"],
        "is_active": True,
        "base_url": DEFAULT_BASE_URL,
        "api_key": "",
        "app_code": "",
        "lottery_codes": ["dlt"],
    },
    {
        "model_code": "gemini-3-flash-preview",
        "display_name": "Gemini-3",
        "provider": "gemini",
        "api_model_name": "gemini-3-flash-preview",
        "version": "1",
        "tags": ["fast"],
        "is_active": False,
        "base_url": DEFAULT_BASE_URL,
        "api_key": "",
        "app_code": "",
        "lottery_codes": ["dlt"],
    },
    {
        "model_code": "deepseek-v3.2",
        "display_name": "DeepSeek-v3.2",
        "provider": "deepseek",
        "api_model_name": "deepseek-chat",
        "version": "1",
        "tags": ["reasoning"],
        "is_active": False,
        "base_url": DEEPSEEK_BASE_URL,
        "api_key": "",
        "app_code": "",
        "lottery_codes": ["dlt"],
    },
    {
        "model_code": "deepseek-v4-flash",
        "display_name": "DeepSeek-V4-Flash",
        "provider": "deepseek",
        "api_model_name": "deepseek-v4-flash",
        "version": "1",
        "tags": ["reasoning", "fast"],
        "is_active": False,
        "base_url": DEEPSEEK_BASE_URL,
        "api_key": "",
        "app_code": "",
        "lottery_codes": ["dlt"],
    },
    {
        "model_code": "deepseek-v4-pro",
        "display_name": "DeepSeek-V4-Pro",
        "provider": "deepseek",
        "api_model_name": "deepseek-v4-pro",
        "version": "1",
        "tags": ["reasoning"],
        "is_active": False,
        "base_url": DEEPSEEK_BASE_URL,
        "api_key": "",
        "app_code": "",
        "lottery_codes": ["dlt"],
    },
    {
        "model_code": "deepseek-reasoner",
        "display_name": "DeepSeek-V3.2-Reasoner",
        "provider": "deepseek",
        "api_model_name": "deepseek-reasoner",
        "version": "1",
        "tags": ["reasoning"],
        "is_active": False,
        "base_url": DEEPSEEK_BASE_URL,
        "api_key": "",
        "app_code": "",
        "lottery_codes": ["dlt"],
    },
    {
        "model_code": "gemini-3.1-pro-preview",
        "display_name": "Gemini-3.1",
        "provider": "gemini",
        "api_model_name": "gemini-3.1-pro-preview",
        "version": "1",
        "tags": ["reasoning"],
        "is_active": False,
        "base_url": DEFAULT_BASE_URL,
        "api_key": "",
        "app_code": "",
        "lottery_codes": ["dlt"],
    },
    {
        "model_code": "doubao-seed-2-0-pro",
        "display_name": "Doubao-Seed-2.0-Pro",
        "provider": "openai_compatible",
        "api_model_name": "doubao-seed-2-0-pro",
        "version": "1",
        "tags": ["reasoning"],
        "is_active": False,
        "base_url": DEFAULT_BASE_URL,
        "api_key": "",
        "app_code": "",
        "lottery_codes": ["dlt"],
    },
    {
        "model_code": "zhipuai-glm-5",
        "display_name": "ZhipuAI/GLM-5",
        "provider": "openai_compatible",
        "api_model_name": "ZhipuAI/GLM-5",
        "version": "1",
        "tags": ["reasoning"],
        "is_active": False,
        "base_url": "https://api-inference.modelscope.cn/v1",
        "api_key": "",
        "app_code": "",
        "lottery_codes": ["dlt"],
    },
]


@dataclass(frozen=True)
class ModelDefinition:
    id: str
    name: str
    provider: str
    model_id: str
    api_model: str
    api_format: str | None = None
    api_key_value: str | None = None
    base_url_value: str | None = None
    app_code_value: str | None = None
    version: str | None = None
    tags: list[str] = field(default_factory=list)
    temperature: float | None = None
    lottery_codes: list[str] = field(default_factory=lambda: ["dlt"])
    is_active: bool = True
    is_deleted: bool = False
    extra: dict[str, Any] = field(default_factory=dict)

    def api_key(self) -> str | None:
        value = (self.api_key_value or "").strip()
        return value or None

    def base_url(self) -> str:
        value = (self.base_url_value or "").strip()
        return value or DEFAULT_BASE_URL

    def app_code(self) -> str | None:
        value = (self.app_code_value or "").strip()
        return value or None

    def uses_aihubmix(self) -> bool:
        hostname = urlparse(self.base_url()).hostname or ""
        hostname = hostname.lower()
        return hostname == "aihubmix.com" or hostname.endswith(".aihubmix.com")

    def has_tags(self, include_tags: Iterable[str]) -> bool:
        if not include_tags:
            return True
        tags = {t.lower() for t in self.tags}
        return all(t.lower() in tags for t in include_tags)

    def supports_lottery(self, lottery_code: str) -> bool:
        code = normalize_lottery_code(lottery_code)
        return code in (self.lottery_codes or ["dlt"])


class ModelRegistry:
    def __init__(self, definitions: Mapping[str, ModelDefinition]):
        self._definitions = dict(definitions)
        self._active_ids = [
            model_id
            for model_id, definition in self._definitions.items()
            if definition.is_active and not definition.is_deleted
        ]

    @property
    def active_ids(self) -> list[str]:
        return list(self._active_ids)

    def get(self, model_id: str) -> ModelDefinition:
        return self._definitions[model_id]

    def select(
        self,
        model_ids: Iterable[str] | None = None,
        include_tags: Iterable[str] | None = None,
    ) -> list[ModelDefinition]:
        chosen_ids = list(model_ids) if model_ids else list(self._active_ids)
        include_tags = list(include_tags or [])
        results: list[ModelDefinition] = []
        for model_id in chosen_ids:
            if model_id not in self._definitions:
                raise KeyError(f"模型配置不存在: {model_id}")
            model_def = self._definitions[model_id]
            if model_def.is_deleted:
                continue
            if model_def.has_tags(include_tags):
                results.append(model_def)
        return results


def bootstrap_default_models() -> None:
    global _bootstrap_ready
    if _bootstrap_ready:
        return
    ensure_schema()
    with _bootstrap_lock:
        if _bootstrap_ready:
            return
        with get_connection() as connection:
            with connection.cursor() as cursor:
                provider_ids: dict[str, int] = {}
                for provider_code in SUPPORTED_PROVIDERS:
                    provider_name = _provider_name(provider_code)
                    provider_base_url = LMSTUDIO_BASE_URL if provider_code == "lmstudio" else (DEEPSEEK_BASE_URL if provider_code == "deepseek" else None)
                    cursor.execute(
                        """
                        INSERT INTO model_provider (provider_code, provider_name, base_url)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            provider_name = VALUES(provider_name),
                            base_url = COALESCE(VALUES(base_url), base_url)
                        """,
                        (provider_code, provider_name, provider_base_url),
                    )
                    cursor.execute(
                        "SELECT id FROM model_provider WHERE provider_code = ?",
                        (provider_code,),
                    )
                    provider_ids[provider_code] = int(cursor.fetchone()["id"])

                _migrate_deepseek_models(cursor, provider_ids)

                for item in DEFAULT_MODEL_CATALOG:
                    cursor.execute("SELECT id FROM ai_model WHERE model_code = ?", (item["model_code"],))
                    existing_row = cursor.fetchone()
                    if existing_row:
                        continue
                    provider_model_id = _ensure_provider_model_config(
                        cursor,
                        provider_ids[item["provider"]],
                        item["api_model_name"],
                        item["display_name"],
                    )
                    cursor.execute(
                        """
                        INSERT INTO ai_model (
                            model_code,
                            display_name,
                            provider_model_id,
                            api_model_name,
                            version,
                            is_active,
                            base_url,
                            api_key,
                            app_code,
                            temperature,
                            is_deleted,
                            updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
                        """,
                        (
                            item["model_code"],
                            item["display_name"],
                            provider_model_id,
                            item["api_model_name"],
                            item.get("version"),
                            1 if item.get("is_active") else 0,
                            item.get("base_url") or DEFAULT_BASE_URL,
                            item.get("api_key") or "",
                            item.get("app_code") or "",
                            item.get("temperature"),
                        ),
                    )
                    cursor.execute(
                        "SELECT id FROM ai_model WHERE model_code = ?",
                        (item["model_code"],),
                    )
                    model_db_id = int(cursor.fetchone()["id"])
                    for tag in item.get("tags", []):
                        cursor.execute(
                            """
                            INSERT INTO model_tag (tag_code, tag_name)
                            VALUES (?, ?)
                            ON DUPLICATE KEY UPDATE tag_name = VALUES(tag_name)
                            """,
                            (tag, tag),
                        )
                        cursor.execute("SELECT id FROM model_tag WHERE tag_code = ?", (tag,))
                        tag_id = int(cursor.fetchone()["id"])
                        cursor.execute(
                            """
                            INSERT INTO ai_model_tag (model_id, tag_id)
                            VALUES (?, ?)
                            ON DUPLICATE KEY UPDATE model_id = VALUES(model_id)
                            """,
                            (model_db_id, tag_id),
                        )
                    for lottery_code in item.get("lottery_codes", ["dlt"]):
                        cursor.execute(
                            """
                            INSERT INTO ai_model_lottery (model_id, lottery_code)
                            VALUES (?, ?)
                            ON DUPLICATE KEY UPDATE lottery_code = VALUES(lottery_code)
                            """,
                            (model_db_id, normalize_lottery_code(lottery_code)),
                        )
        _bootstrap_ready = True
        invalidate_model_registry_cache()


def _migrate_deepseek_models(cursor, provider_ids: dict[str, int]) -> None:
    deepseek_provider_id = provider_ids["deepseek"]
    legacy_chat_provider_model_id = _ensure_provider_model_config(
        cursor,
        deepseek_provider_id,
        "deepseek-chat",
        "DeepSeek Chat (legacy alias)",
    )
    _ensure_provider_model_config(cursor, deepseek_provider_id, "deepseek-reasoner", "DeepSeek Reasoner (legacy alias)")
    _ensure_provider_model_config(cursor, deepseek_provider_id, "deepseek-v4-flash", "DeepSeek V4 Flash")
    _ensure_provider_model_config(cursor, deepseek_provider_id, "deepseek-v4-pro", "DeepSeek V4 Pro")
    cursor.execute("SELECT id FROM ai_model WHERE model_code = ?", ("deepseek-v3.2",))
    row = cursor.fetchone()
    if row:
        cursor.execute(
            """
            UPDATE ai_model
            SET provider_model_id = ?,
                api_model_name = ?,
                base_url = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE model_code = ?
            """,
            (legacy_chat_provider_model_id, "deepseek-chat", DEEPSEEK_BASE_URL, "deepseek-v3.2"),
        )
    cursor.execute(
        """
        UPDATE ai_model
        SET base_url = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE provider_model_id IN (
            SELECT pmc.id
            FROM provider_model_config pmc
            WHERE pmc.provider_id = ?
        )
        AND (base_url IS NULL OR base_url = '' OR base_url = 'https://api.deepseek.com/v1')
        """,
        (DEEPSEEK_BASE_URL, deepseek_provider_id),
    )
    for tag in ("reasoning",):
        cursor.execute(
            """
            INSERT INTO model_tag (tag_code, tag_name)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE tag_name = VALUES(tag_name)
            """,
            (tag, tag),
        )


def _ensure_provider_model_config(cursor, provider_id: int, model_id: str, display_name: str) -> int:
    cursor.execute(
        """
        SELECT id
        FROM provider_model_config
        WHERE provider_id = ? AND model_id = ?
        LIMIT 1
        """,
        (provider_id, model_id),
    )
    row = cursor.fetchone()
    if row:
        cursor.execute(
            """
            UPDATE provider_model_config
            SET display_name = ?,
                is_deleted = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (display_name, int(row["id"])),
        )
        return int(row["id"])

    cursor.execute(
        "SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM provider_model_config WHERE provider_id = ?",
        (provider_id,),
    )
    sort_order = int((cursor.fetchone() or {}).get("sort_order") or 0) + 1
    cursor.execute(
        """
        INSERT INTO provider_model_config (provider_id, model_id, display_name, sort_order, is_deleted)
        VALUES (?, ?, ?, ?, 0)
        """,
        (provider_id, model_id, display_name, sort_order),
    )
    return int(cursor.lastrowid)


def _provider_name(provider_code: str) -> str:
    if provider_code == "deepseek":
        return "DeepSeek"
    if provider_code == "lmstudio":
        return "LM Studio"
    return provider_code.replace("_", " ").title()


def invalidate_model_registry_cache() -> None:
    global _registry_cache_entry
    with _registry_cache_lock:
        _registry_cache_entry = None


def load_model_registry(_config_path: str | None = None, *, use_cache: bool = True) -> ModelRegistry:
    global _registry_cache_entry
    if use_cache:
        now = monotonic()
        with _registry_cache_lock:
            cached = _registry_cache_entry
            if cached and cached[0] > now:
                return cached[1]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    am.model_code,
                    am.display_name,
                    mp.provider_code,
                    mp.api_format,
                    pmc.provider_id,
                    mp.base_url AS provider_base_url,
                    mp.api_key AS provider_api_key,
                    am.api_model_name,
                    pmc.model_id AS provider_model_name,
                    am.version,
                    am.base_url,
                    am.api_key,
                    am.app_code,
                    am.temperature,
                    am.is_active,
                    am.is_deleted
                FROM ai_model am
                LEFT JOIN provider_model_config pmc ON pmc.id = am.provider_model_id
                LEFT JOIN model_provider mp ON mp.id = pmc.provider_id
                ORDER BY am.is_active DESC, am.model_code ASC
                """
            )
            rows = cursor.fetchall()
            if not rows:
                raise ValueError("数据库中没有模型配置")
            model_codes = [str(row["model_code"]) for row in rows]
            tags_by_code = _fetch_tags(cursor, model_codes)
            lotteries_by_code = _fetch_lotteries(cursor, model_codes)
            provider_ids = sorted({int(row["provider_id"]) for row in rows if row.get("provider_id") is not None})
            extra_options_by_provider_id = _fetch_provider_options(cursor, provider_ids)

    definitions: dict[str, ModelDefinition] = {}
    for row in rows:
        model_code = str(row["model_code"])
        definitions[model_code] = ModelDefinition(
            id=model_code,
            name=str(row["display_name"]),
            provider=str(row["provider_code"]),
            api_format=str(row.get("api_format") or "openai_compatible"),
            model_id=model_code,
            api_model=str(row.get("api_model_name") or row.get("provider_model_name") or model_code),
            api_key_value=row.get("api_key") or row.get("provider_api_key"),
            base_url_value=row.get("base_url") or row.get("provider_base_url"),
            app_code_value=row.get("app_code"),
            version=row.get("version"),
            tags=tags_by_code.get(model_code, []),
            temperature=row.get("temperature"),
            lottery_codes=lotteries_by_code.get(model_code, ["dlt"]),
            is_active=bool(row.get("is_active")),
            is_deleted=bool(row.get("is_deleted")),
            extra=extra_options_by_provider_id.get(int(row["provider_id"]), {}) if row.get("provider_id") is not None else {},
        )
    registry = ModelRegistry(definitions=definitions)
    if use_cache:
        with _registry_cache_lock:
            _registry_cache_entry = (monotonic() + MODEL_REGISTRY_CACHE_TTL_SECONDS, registry)
    return registry


def _fetch_tags(cursor, model_codes: list[str]) -> dict[str, list[str]]:
    if not model_codes:
        return {}
    placeholders = ", ".join("?" for _ in model_codes)
    cursor.execute(
        f"""
        SELECT am.model_code, mt.tag_code
        FROM ai_model am
        INNER JOIN ai_model_tag amt ON amt.model_id = am.id
        INNER JOIN model_tag mt ON mt.id = amt.tag_id
        WHERE am.model_code IN ({placeholders})
        ORDER BY mt.tag_code ASC
        """,
        tuple(model_codes),
    )
    result: dict[str, list[str]] = {}
    for row in cursor.fetchall():
        result.setdefault(str(row["model_code"]), []).append(str(row["tag_code"]))
    return result


def _fetch_lotteries(cursor, model_codes: list[str]) -> dict[str, list[str]]:
    if not model_codes:
        return {}
    placeholders = ", ".join("?" for _ in model_codes)
    cursor.execute(
        f"""
        SELECT am.model_code, aml.lottery_code
        FROM ai_model am
        INNER JOIN ai_model_lottery aml ON aml.model_id = am.id
        WHERE am.model_code IN ({placeholders})
        ORDER BY aml.lottery_code ASC
        """,
        tuple(model_codes),
    )
    result: dict[str, list[str]] = {}
    for row in cursor.fetchall():
        result.setdefault(str(row["model_code"]), []).append(str(row["lottery_code"]))
    return result


def _fetch_provider_options(cursor, provider_ids: list[int]) -> dict[int, dict[str, Any]]:
    if not provider_ids:
        return {}
    placeholders = ", ".join("?" for _ in provider_ids)
    cursor.execute(
        f"""
        SELECT provider_id, option_key, option_value
        FROM model_provider_option
        WHERE provider_id IN ({placeholders})
        ORDER BY provider_id ASC, option_key ASC
        """,
        tuple(provider_ids),
    )
    result: dict[int, dict[str, Any]] = {}
    for row in cursor.fetchall():
        provider_id = int(row["provider_id"])
        option_value = row.get("option_value")
        parsed_value: Any = option_value
        try:
            parsed_value = json.loads(str(option_value))
        except Exception:
            parsed_value = option_value
        result.setdefault(provider_id, {})[str(row["option_key"])] = parsed_value
    return result


def _parse_extra_options(value: Any) -> dict[str, Any]:
    text = str(value or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}
