# -*- coding: utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse

from app.db.connection import ensure_schema, get_connection


DEFAULT_BASE_URL = "https://aihubmix.com/v1"
SUPPORTED_PROVIDERS = (
    "openai",
    "anthropic",
    "gemini",
    "openai_compatible",
)

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
    },
    {
        "model_code": "deepseek-v3.2",
        "display_name": "DeepSeek-v3.2",
        "provider": "openai_compatible",
        "api_model_name": "deepseek-v3.2",
        "version": "1",
        "tags": ["reasoning"],
        "is_active": False,
        "base_url": DEFAULT_BASE_URL,
        "api_key": "",
        "app_code": "",
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
    },
]


@dataclass(frozen=True)
class ModelDefinition:
    id: str
    name: str
    provider: str
    model_id: str
    api_model: str
    api_key_value: str | None = None
    base_url_value: str | None = None
    app_code_value: str | None = None
    version: str | None = None
    tags: list[str] = field(default_factory=list)
    temperature: float | None = None
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
    ensure_schema()
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS total FROM ai_model")
            total = int((cursor.fetchone() or {}).get("total") or 0)
            if total:
                return
            provider_ids: dict[str, int] = {}
            for provider_code in SUPPORTED_PROVIDERS:
                provider_name = provider_code.replace("_", " ").title()
                cursor.execute(
                    """
                    INSERT INTO model_provider (provider_code, provider_name)
                    VALUES (?, ?)
                    ON CONFLICT (provider_code) DO UPDATE SET provider_name = excluded.provider_name
                    """,
                    (provider_code, provider_name),
                )
                cursor.execute(
                    "SELECT id FROM model_provider WHERE provider_code = ?",
                    (provider_code,),
                )
                provider_ids[provider_code] = int(cursor.fetchone()["id"])

            for item in DEFAULT_MODEL_CATALOG:
                cursor.execute(
                    """
                    INSERT INTO ai_model (
                        model_code,
                        display_name,
                        provider_id,
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
                        provider_ids[item["provider"]],
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
                        ON CONFLICT (tag_code) DO UPDATE SET tag_name = excluded.tag_name
                        """,
                        (tag, tag),
                    )
                    cursor.execute("SELECT id FROM model_tag WHERE tag_code = ?", (tag,))
                    tag_id = int(cursor.fetchone()["id"])
                    cursor.execute(
                        """
                        INSERT OR IGNORE INTO ai_model_tag (model_id, tag_id)
                        VALUES (?, ?)
                        """,
                        (model_db_id, tag_id),
                    )


def load_model_registry(_config_path: str | None = None) -> ModelRegistry:
    bootstrap_default_models()
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    am.model_code,
                    am.display_name,
                    mp.provider_code,
                    am.api_model_name,
                    am.version,
                    am.base_url,
                    am.api_key,
                    am.app_code,
                    am.temperature,
                    am.is_active,
                    am.is_deleted
                FROM ai_model am
                INNER JOIN model_provider mp ON mp.id = am.provider_id
                ORDER BY am.is_active DESC, am.model_code ASC
                """
            )
            rows = cursor.fetchall()
            if not rows:
                raise ValueError("数据库中没有模型配置")
            model_codes = [str(row["model_code"]) for row in rows]
            tags_by_code = _fetch_tags(cursor, model_codes)

    definitions: dict[str, ModelDefinition] = {}
    for row in rows:
        model_code = str(row["model_code"])
        definitions[model_code] = ModelDefinition(
            id=model_code,
            name=str(row["display_name"]),
            provider=str(row["provider_code"]),
            model_id=model_code,
            api_model=str(row.get("api_model_name") or model_code),
            api_key_value=row.get("api_key"),
            base_url_value=row.get("base_url"),
            app_code_value=row.get("app_code"),
            version=row.get("version"),
            tags=tags_by_code.get(model_code, []),
            temperature=row.get("temperature"),
            is_active=bool(row.get("is_active")),
            is_deleted=bool(row.get("is_deleted")),
        )
    return ModelRegistry(definitions=definitions)


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
