from __future__ import annotations

import json
import re
from typing import Any

from backend.app.db.connection import get_connection
from backend.app.lotteries import SUPPORTED_LOTTERY_CODES, normalize_lottery_code
from backend.app.time_utils import now_ts
from backend.core.model_config import DEEPSEEK_BASE_URL, DEFAULT_BASE_URL, LMSTUDIO_BASE_URL, SUPPORTED_API_FORMATS, invalidate_model_registry_cache


PROVIDER_LABELS = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "gemini": "Gemini",
    "deepseek": "DeepSeek",
    "lmstudio": "LM Studio",
    "openai_compatible": "OpenAI Compatible",
}
PROVIDER_CODE_PATTERN = re.compile(r"^[a-z0-9-]+$")

PRESET_PROVIDER_TEMPLATES: dict[str, dict[str, Any]] = {
    "deepseek": {
        "provider_name": "DeepSeek",
        "website_url": "https://platform.deepseek.com",
        "api_format": "openai_compatible",
        "base_url": DEEPSEEK_BASE_URL,
        "remark": "",
        "is_system_preset": True,
        "model_configs": [
            {"model_id": "deepseek-v4-flash", "display_name": "DeepSeek V4 Flash"},
            {"model_id": "deepseek-v4-pro", "display_name": "DeepSeek V4 Pro"},
            {"model_id": "deepseek-chat", "display_name": "DeepSeek Chat (legacy alias)"},
            {"model_id": "deepseek-reasoner", "display_name": "DeepSeek Reasoner (legacy alias)"},
        ],
    },
    "aimixhub": {
        "provider_name": "AiMixHub",
        "website_url": "https://aihubmix.com",
        "api_format": "anthropic",
        "base_url": "https://aihubmix.com/v1",
        "remark": "",
        "is_system_preset": True,
        "model_configs": [
            {"model_id": "claude-sonnet-4-6", "display_name": "Claude Sonnet 4.6"},
            {"model_id": "claude-opus-4-6", "display_name": "Claude Opus 4.6"},
        ],
    },
    "lmstudio": {
        "provider_name": "LM Studio",
        "website_url": "https://lmstudio.ai",
        "api_format": "openai_compatible",
        "base_url": LMSTUDIO_BASE_URL,
        "remark": "Local OpenAI-compatible server",
        "is_system_preset": True,
        "model_configs": [],
    },
}


class ModelRepository:
    def list_models(self, include_deleted: bool = False) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                rows = self._fetch_models(cursor, include_deleted=include_deleted)
                model_codes = [row["model_code"] for row in rows]
                lotteries_by_code = self._fetch_lotteries(cursor, model_codes)
        return [self._serialize_model(row, lotteries_by_code.get(row["model_code"], ["dlt"])) for row in rows]

    def get_model(self, model_code: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                rows = self._fetch_models(cursor, include_deleted=True, model_codes=[model_code])
                if not rows:
                    return None
                lotteries_by_code = self._fetch_lotteries(cursor, [model_code])
        return self._serialize_model(rows[0], lotteries_by_code.get(model_code, ["dlt"]))

    def create_model(self, payload: dict[str, Any]) -> dict[str, Any]:
        model_code = str(payload["model_code"]).strip()
        self._validate_payload(payload, is_create=True)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM ai_model WHERE model_code = ?", (model_code,))
                if cursor.fetchone():
                    raise ValueError(f"模型编码已存在: {model_code}")
                provider_row = self._resolve_provider(cursor, str(payload["provider"]))
                provider_id = int(provider_row["id"])
                self._sync_provider_api_format(cursor, provider_id, payload.get("api_format"))
                provider_model_id, api_model_name = self._resolve_provider_model_binding(cursor, provider_id, payload)
                cursor.execute(
                    """
                    INSERT INTO ai_model (
                        model_code,
                        display_name,
                        provider_model_id,
                        api_model_name,
                        is_active,
                        base_url,
                        api_key,
                        app_code,
                        temperature,
                        is_deleted,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        model_code,
                        str(payload["display_name"]).strip(),
                        provider_model_id,
                        api_model_name,
                        1 if payload.get("is_active", True) else 0,
                        self._normalize_base_url(payload.get("base_url"), str(provider_row.get("base_url") or ""), str(payload["provider"])),
                        self._optional_str(payload.get("api_key")) or self._optional_str(provider_row.get("api_key")) or "",
                        self._optional_str(payload.get("app_code")) or "",
                        float(payload.get("temperature")),
                        0,
                        now_ts(),
                    ),
                )
                cursor.execute("SELECT id FROM ai_model WHERE model_code = ?", (model_code,))
                model_id = int(cursor.fetchone()["id"])
                self._save_lotteries(cursor, model_id, self._normalize_lottery_codes(payload.get("lottery_codes")))
        invalidate_model_registry_cache()
        return self.get_model(model_code) or {}

    def update_model(self, model_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._validate_payload(payload, is_create=False)
        next_model_code = str(payload.get("model_code") or "").strip()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id FROM ai_model WHERE model_code = ?", (model_code,))
                row = cursor.fetchone()
                if not row:
                    raise KeyError(model_code)
                model_id = int(row["id"])
                if not next_model_code:
                    next_model_code = model_code
                if next_model_code != model_code:
                    cursor.execute("SELECT 1 FROM ai_model WHERE model_code = ?", (next_model_code,))
                    if cursor.fetchone():
                        raise ValueError(f"模型编码已存在: {next_model_code}")
                provider_row = self._resolve_provider(cursor, str(payload["provider"]))
                provider_id = int(provider_row["id"])
                self._sync_provider_api_format(cursor, provider_id, payload.get("api_format"))
                provider_model_id, api_model_name = self._resolve_provider_model_binding(cursor, provider_id, payload)
                cursor.execute(
                    """
                    UPDATE ai_model
                    SET model_code = ?,
                        display_name = ?,
                        provider_model_id = ?,
                        api_model_name = ?,
                        is_active = ?,
                        base_url = ?,
                        api_key = ?,
                        app_code = ?,
                        temperature = ?,
                        updated_at = ?
                    WHERE model_code = ?
                    """,
                    (
                        next_model_code,
                        str(payload["display_name"]).strip(),
                        provider_model_id,
                        api_model_name,
                        1 if payload.get("is_active", True) else 0,
                        self._normalize_base_url(payload.get("base_url"), str(provider_row.get("base_url") or ""), str(payload["provider"])),
                        self._optional_str(payload.get("api_key")) or self._optional_str(provider_row.get("api_key")) or "",
                        self._optional_str(payload.get("app_code")) or "",
                        float(payload.get("temperature")),
                        now_ts(),
                        model_code,
                    ),
                )
                self._save_lotteries(cursor, model_id, self._normalize_lottery_codes(payload.get("lottery_codes")))
        invalidate_model_registry_cache()
        return self.get_model(next_model_code) or {}

    def set_model_active(self, model_code: str, is_active: bool) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE ai_model
                    SET is_active = ?, updated_at = ?
                    WHERE model_code = ?
                    """,
                    (1 if is_active else 0, now_ts(), model_code),
                )
                if cursor.rowcount == 0:
                    raise KeyError(model_code)
                if not is_active:
                    self._remove_model_from_prediction_tasks(cursor, model_code)
        invalidate_model_registry_cache()
        return self.get_model(model_code) or {}

    def soft_delete_model(self, model_code: str) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE ai_model
                    SET is_deleted = 1, is_active = 0, updated_at = ?
                    WHERE model_code = ?
                    """,
                    (now_ts(), model_code),
                )
                if cursor.rowcount == 0:
                    raise KeyError(model_code)
        invalidate_model_registry_cache()
        return self.get_model(model_code) or {}

    def restore_model(self, model_code: str) -> dict[str, Any]:
        result = self._update_flag(model_code, "is_deleted", 0)
        invalidate_model_registry_cache()
        return result

    def list_providers(self) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                self._ensure_preset_providers(cursor)
                cursor.execute(
                    """
                    SELECT
                        id,
                        provider_code,
                        provider_name,
                        api_format,
                        remark,
                        website_url,
                        api_key,
                        base_url,
                        is_system_preset,
                        is_deleted
                    FROM model_provider
                    WHERE is_deleted = 0
                    ORDER BY is_system_preset DESC, provider_name ASC, provider_code ASC
                    """
                )
                provider_rows = cursor.fetchall()
                provider_ids = [int(row["id"]) for row in provider_rows]
                model_configs = self._fetch_provider_model_configs(cursor, provider_ids)
                provider_options = self._fetch_provider_options(cursor, provider_ids)
        return [
            self._serialize_provider(
                row,
                model_configs.get(int(row["id"]), []),
                provider_options.get(int(row["id"])),
            )
            for row in provider_rows
        ]

    def get_provider(self, provider_code: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                self._ensure_preset_providers(cursor)
                cursor.execute(
                    """
                    SELECT
                        id,
                        provider_code,
                        provider_name,
                        api_format,
                        remark,
                        website_url,
                        api_key,
                        base_url,
                        is_system_preset,
                        is_deleted
                    FROM model_provider
                    WHERE provider_code = ?
                    """,
                    (provider_code,),
                )
                row = cursor.fetchone()
                if not row or bool(row.get("is_deleted")):
                    return None
                provider_id = int(row["id"])
                model_configs = self._fetch_provider_model_configs(cursor, [provider_id]).get(provider_id, [])
                provider_options = self._fetch_provider_options(cursor, [provider_id]).get(provider_id)
        return self._serialize_provider(row, model_configs, provider_options)

    def create_provider(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_provider_payload(payload, is_create=True)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                self._ensure_preset_providers(cursor)
                cursor.execute("SELECT 1 FROM model_provider WHERE provider_code = ?", (normalized["code"],))
                if cursor.fetchone():
                    raise ValueError(f"供应商标识已存在: {normalized['code']}")
                cursor.execute(
                    """
                    INSERT INTO model_provider (
                        provider_code,
                        provider_name,
                        api_format,
                        remark,
                        website_url,
                        api_key,
                        base_url,
                        is_system_preset,
                        is_deleted
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                    """,
                    (
                        normalized["code"],
                        normalized["name"],
                        normalized["api_format"],
                        normalized["remark"],
                        normalized["website_url"],
                        normalized["api_key"],
                        normalized["base_url"],
                        1 if normalized["is_system_preset"] else 0,
                    ),
                )
                cursor.execute("SELECT id FROM model_provider WHERE provider_code = ?", (normalized["code"],))
                provider_id = int(cursor.fetchone()["id"])
                self._replace_provider_model_configs(cursor, provider_id, normalized["model_configs"])
                self._replace_provider_options(cursor, provider_id, normalized["extra_options"])
        invalidate_model_registry_cache()
        return self.get_provider(normalized["code"]) or {}

    def update_provider(self, provider_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_provider_payload(payload, is_create=False)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id, is_deleted FROM model_provider WHERE provider_code = ?", (provider_code,))
                row = cursor.fetchone()
                if not row:
                    raise KeyError(provider_code)
                if bool(row.get("is_deleted")):
                    raise ValueError("供应商已删除")
                provider_id = int(row["id"])
                cursor.execute(
                    """
                    UPDATE model_provider
                    SET provider_name = ?,
                        api_format = ?,
                        remark = ?,
                        website_url = ?,
                        api_key = ?,
                        base_url = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE provider_code = ?
                    """,
                    (
                        normalized["name"],
                        normalized["api_format"],
                        normalized["remark"],
                        normalized["website_url"],
                        normalized["api_key"],
                        normalized["base_url"],
                        provider_code,
                    ),
                )
                if "model_configs" in normalized:
                    self._replace_provider_model_configs(cursor, provider_id, normalized["model_configs"])
                self._replace_provider_options(cursor, provider_id, normalized["extra_options"])
        invalidate_model_registry_cache()
        return self.get_provider(provider_code) or {}

    def delete_provider(self, provider_code: str) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id FROM model_provider WHERE provider_code = ?", (provider_code,))
                row = cursor.fetchone()
                if not row:
                    raise KeyError(provider_code)
                provider_id = int(row["id"])
                cursor.execute(
                    """
                    UPDATE model_provider
                    SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (provider_id,),
                )
                cursor.execute(
                    """
                    UPDATE provider_model_config
                    SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE provider_id = ?
                    """,
                    (provider_id,),
                )
        invalidate_model_registry_cache()
        return {"provider_code": provider_code, "success": True}

    def list_active_model_codes(self) -> set[str]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT model_code
                    FROM ai_model
                    WHERE is_active = 1 AND is_deleted = 0
                    """
                )
                return {str(row["model_code"]) for row in cursor.fetchall() if row.get("model_code")}

    def _update_flag(self, model_code: str, field_name: str, value: int) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE ai_model
                    SET {field_name} = ?, updated_at = ?
                    WHERE model_code = ?
                    """,
                    (value, now_ts(), model_code),
                )
                if cursor.rowcount == 0:
                    raise KeyError(model_code)
        return self.get_model(model_code) or {}

    def _fetch_models(
        self,
        cursor,
        *,
        include_deleted: bool,
        model_codes: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        sql = """
            SELECT
                am.model_code,
                am.display_name,
                mp.provider_code,
                mp.api_format,
                am.provider_model_id,
                am.api_model_name,
                pmc.model_id AS provider_model_name,
                am.base_url,
                am.api_key,
                am.app_code,
                am.temperature,
                am.is_active,
                am.is_deleted,
                am.updated_at
            FROM ai_model am
            INNER JOIN provider_model_config pmc ON pmc.id = am.provider_model_id
            INNER JOIN model_provider mp ON mp.id = pmc.provider_id
        """
        params: list[Any] = []
        where_clauses: list[str] = []
        if not include_deleted:
            where_clauses.append("am.is_deleted = 0")
            where_clauses.append("mp.is_deleted = 0")
        if model_codes:
            placeholders = ", ".join("?" for _ in model_codes)
            where_clauses.append(f"am.model_code IN ({placeholders})")
            params.extend(model_codes)
        if where_clauses:
            sql += " WHERE " + " AND ".join(where_clauses)
        sql += " ORDER BY am.is_active DESC, am.updated_at DESC, am.model_code ASC"
        cursor.execute(sql, tuple(params))
        return cursor.fetchall()

    def _fetch_lotteries(self, cursor, model_codes: list[str]) -> dict[str, list[str]]:
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

    def _save_lotteries(self, cursor, model_id: int, lottery_codes: list[str]) -> None:
        cursor.execute("DELETE FROM ai_model_lottery WHERE model_id = ?", (model_id,))
        for lottery_code in lottery_codes:
            cursor.execute(
                """
                INSERT INTO ai_model_lottery (model_id, lottery_code)
                VALUES (?, ?)
                """,
                (model_id, lottery_code),
            )

    @staticmethod
    def _remove_model_from_prediction_tasks(cursor, model_code: str) -> None:
        cursor.execute("SELECT id FROM ai_model WHERE model_code = ?", (model_code,))
        model_row = cursor.fetchone()
        model_id = int(model_row["id"]) if model_row else None
        cursor.execute("SELECT id FROM scheduled_task WHERE task_type = 'prediction_generate'")
        rows = cursor.fetchall()
        for row in rows:
            task_id = int(row["id"])
            if model_id is None:
                continue
            cursor.execute(
                """
                DELETE FROM scheduled_task_model
                WHERE task_id = ? AND model_id = ?
                """,
                (task_id, model_id),
            )
            if cursor.rowcount <= 0:
                continue
            cursor.execute("SELECT COUNT(*) AS total FROM scheduled_task_model WHERE task_id = ?", (task_id,))
            remaining = int((cursor.fetchone() or {}).get("total") or 0)
            if remaining > 0:
                cursor.execute(
                    """
                    UPDATE scheduled_task
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (task_id,),
                )
                continue
            cursor.execute(
                """
                UPDATE scheduled_task
                SET is_active = 0,
                    next_run_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (task_id,),
            )

    def _upsert_provider(self, cursor, provider_code: str) -> int:
        provider_name = PROVIDER_LABELS.get(provider_code, provider_code.replace("-", " ").replace("_", " ").title())
        provider_base_url = LMSTUDIO_BASE_URL if provider_code == "lmstudio" else (DEEPSEEK_BASE_URL if provider_code == "deepseek" else DEFAULT_BASE_URL)
        cursor.execute(
            """
            INSERT INTO model_provider (provider_code, provider_name, api_format, base_url, is_deleted)
            VALUES (?, ?, ?, ?, 0)
            ON DUPLICATE KEY UPDATE
                provider_name = VALUES(provider_name),
                api_format = COALESCE(api_format, VALUES(api_format)),
                base_url = COALESCE(VALUES(base_url), base_url),
                is_deleted = 0
            """,
            (provider_code, provider_name, "openai_compatible", provider_base_url),
        )
        cursor.execute("SELECT id FROM model_provider WHERE provider_code = ?", (provider_code,))
        return int(cursor.fetchone()["id"])

    def _ensure_preset_providers(self, cursor) -> None:
        for provider_code, template in PRESET_PROVIDER_TEMPLATES.items():
            cursor.execute(
                """
                INSERT INTO model_provider (
                    provider_code,
                    provider_name,
                    api_format,
                    remark,
                    website_url,
                    api_key,
                    base_url,
                    is_system_preset,
                    is_deleted
                )
                VALUES (?, ?, ?, ?, ?, '', ?, 1, 0)
                ON DUPLICATE KEY UPDATE
                    provider_name = VALUES(provider_name),
                    api_format = VALUES(api_format),
                    website_url = VALUES(website_url),
                    base_url = VALUES(base_url),
                    is_system_preset = 1
                """,
                (
                    provider_code,
                    template["provider_name"],
                    template["api_format"],
                    template.get("remark") or "",
                    template.get("website_url") or "",
                    template.get("base_url") or DEFAULT_BASE_URL,
                ),
            )
            cursor.execute("SELECT id FROM model_provider WHERE provider_code = ?", (provider_code,))
            row = cursor.fetchone()
            if not row:
                continue
            provider_id = int(row["id"])
            cursor.execute(
                """
                UPDATE model_provider
                SET is_deleted = 0
                WHERE id = ?
                """,
                (provider_id,),
            )
            if template.get("model_configs"):
                for index, model_config in enumerate(template["model_configs"]):
                    cursor.execute(
                        """
                        INSERT INTO provider_model_config (
                            provider_id,
                            model_id,
                            display_name,
                            sort_order,
                            is_deleted
                        )
                        VALUES (?, ?, ?, ?, 0)
                        ON DUPLICATE KEY UPDATE
                            display_name = VALUES(display_name),
                            sort_order = VALUES(sort_order),
                            is_deleted = 0
                        """,
                        (
                            provider_id,
                            str(model_config.get("model_id") or "").strip(),
                            str(model_config.get("display_name") or "").strip() or str(model_config.get("model_id") or "").strip(),
                            index + 1,
                        ),
                    )

    @staticmethod
    def _fetch_provider_model_configs(cursor, provider_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
        if not provider_ids:
            return {}
        placeholders = ", ".join("?" for _ in provider_ids)
        cursor.execute(
            f"""
            SELECT
                id,
                provider_id,
                model_id,
                display_name,
                sort_order,
                is_deleted
            FROM provider_model_config
            WHERE provider_id IN ({placeholders}) AND is_deleted = 0
            ORDER BY provider_id ASC, sort_order ASC, id ASC
            """,
            tuple(provider_ids),
        )
        result: dict[int, list[dict[str, Any]]] = {}
        for row in cursor.fetchall():
            provider_id = int(row["provider_id"])
            result.setdefault(provider_id, []).append(
                {
                    "id": int(row["id"]),
                    "model_id": str(row["model_id"]),
                    "display_name": str(row.get("display_name") or row["model_id"]),
                }
            )
        return result

    @staticmethod
    def _serialize_provider(
        row: dict[str, Any],
        model_configs: list[dict[str, Any]],
        extra_options: dict[str, Any] | None,
    ) -> dict[str, Any]:
        return {
            "id": int(row["id"]),
            "code": str(row["provider_code"]),
            "name": str(row["provider_name"]),
            "api_format": str(row.get("api_format") or "openai_compatible"),
            "remark": str(row.get("remark") or ""),
            "website_url": str(row.get("website_url") or ""),
            "api_key": str(row.get("api_key") or ""),
            "base_url": str(row.get("base_url") or ""),
            "extra_options": extra_options or {},
            "is_system_preset": bool(row.get("is_system_preset")),
            "model_configs": model_configs,
        }

    def _normalize_provider_payload(self, payload: dict[str, Any], *, is_create: bool) -> dict[str, Any]:
        code = str(payload.get("code") or "").strip()
        if is_create:
            if not code:
                raise ValueError("供应商标识不能为空")
            if not PROVIDER_CODE_PATTERN.match(code):
                raise ValueError("供应商标识只能包含小写字母、数字和连字符")
        name = str(payload.get("name") or "").strip()
        if not name:
            raise ValueError("供应商名称不能为空")
        api_format = str(payload.get("api_format") or "openai_compatible").strip().lower()
        if api_format not in SUPPORTED_API_FORMATS:
            raise ValueError("不支持的接口格式")
        extra_options = payload.get("extra_options") or {}
        if not isinstance(extra_options, dict):
            raise ValueError("额外选项必须是对象")
        model_configs_payload = payload.get("model_configs")
        model_configs: list[dict[str, str]] = []
        if isinstance(model_configs_payload, list):
            seen_model_ids: set[str] = set()
            for item in model_configs_payload:
                model_id = str((item or {}).get("model_id") or "").strip()
                if not model_id or model_id in seen_model_ids:
                    continue
                seen_model_ids.add(model_id)
                display_name = str((item or {}).get("display_name") or "").strip() or model_id
                model_configs.append({"model_id": model_id, "display_name": display_name})
        normalized: dict[str, Any] = {
            "code": code,
            "name": name,
            "api_format": api_format,
            "remark": str(payload.get("remark") or "").strip(),
            "website_url": str(payload.get("website_url") or "").strip(),
            "api_key": str(payload.get("api_key") or "").strip(),
            "base_url": str(payload.get("base_url") or "").strip() or DEFAULT_BASE_URL,
            "extra_options": dict(extra_options),
            "is_system_preset": bool(payload.get("is_system_preset", False)),
        }
        if "model_configs" in payload:
            normalized["model_configs"] = model_configs
        return normalized

    @staticmethod
    def _replace_provider_model_configs(cursor, provider_id: int, model_configs: list[dict[str, str]]) -> None:
        cursor.execute(
            """
            UPDATE provider_model_config
            SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
            WHERE provider_id = ?
            """,
            (provider_id,),
        )
        for index, model in enumerate(model_configs):
            cursor.execute(
                """
                INSERT INTO provider_model_config (provider_id, model_id, display_name, sort_order, is_deleted)
                VALUES (?, ?, ?, ?, 0)
                ON DUPLICATE KEY UPDATE
                    display_name = VALUES(display_name),
                    sort_order = VALUES(sort_order),
                    is_deleted = 0,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    provider_id,
                    str(model.get("model_id") or "").strip(),
                    str(model.get("display_name") or "").strip() or str(model.get("model_id") or "").strip(),
                    index + 1,
                ),
            )

    def _resolve_provider(self, cursor, provider_code: str) -> dict[str, Any]:
        code = str(provider_code or "").strip()
        if not code:
            raise ValueError("provider 不能为空")
        cursor.execute(
            """
            SELECT id, provider_code, api_format, base_url, api_key, is_deleted
            FROM model_provider
            WHERE provider_code = ?
            """,
            (code,),
        )
        provider_row = cursor.fetchone()
        if not provider_row:
            self._upsert_provider(cursor, code)
            cursor.execute(
                """
                SELECT id, provider_code, api_format, base_url, api_key, is_deleted
                FROM model_provider
                WHERE provider_code = ?
                """,
                (code,),
            )
            provider_row = cursor.fetchone()
        if not provider_row:
            raise ValueError("供应商不存在")
        if bool(provider_row.get("is_deleted")):
            raise ValueError("供应商已删除")
        return provider_row

    @staticmethod
    def _sync_provider_api_format(cursor, provider_id: int, api_format: Any) -> None:
        normalized = str(api_format or "").strip().lower()
        if not normalized:
            return
        if normalized not in SUPPORTED_API_FORMATS:
            raise ValueError("不支持的接口格式")
        cursor.execute(
            """
            UPDATE model_provider
            SET api_format = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (normalized, provider_id),
        )

    @staticmethod
    def _resolve_provider_model_binding(cursor, provider_id: int, payload: dict[str, Any]) -> tuple[int | None, str]:
        provider_model_id_raw = payload.get("provider_model_id")
        provider_model_id = int(provider_model_id_raw) if str(provider_model_id_raw or "").strip() else None
        provider_model_name = str(payload.get("provider_model_name") or "").strip()
        api_model_name = str(payload.get("api_model_name") or "").strip()
        if provider_model_id is not None:
            cursor.execute(
                """
                SELECT id, model_id
                FROM provider_model_config
                WHERE id = ? AND provider_id = ? AND is_deleted = 0
                """,
                (provider_model_id, provider_id),
            )
            row = cursor.fetchone()
            if not row:
                raise ValueError("供应商模型配置不存在")
            if not api_model_name:
                api_model_name = str(row.get("model_id") or "")
        else:
            config_model_id = provider_model_name or api_model_name
            if not config_model_id:
                raise ValueError("api_model_name 不能为空")
            cursor.execute(
                """
                SELECT id
                FROM provider_model_config
                WHERE provider_id = ? AND model_id = ? AND is_deleted = 0
                LIMIT 1
                """,
                (provider_id, config_model_id),
            )
            row = cursor.fetchone()
            if row:
                provider_model_id = int(row["id"])
            else:
                cursor.execute("SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM provider_model_config WHERE provider_id = ?", (provider_id,))
                sort_order = int((cursor.fetchone() or {}).get("sort_order") or 0) + 1
                cursor.execute(
                    """
                    INSERT INTO provider_model_config (provider_id, model_id, display_name, sort_order, is_deleted)
                    VALUES (?, ?, ?, ?, 0)
                    """,
                    (
                        provider_id,
                        config_model_id,
                        provider_model_name or api_model_name or config_model_id,
                        sort_order,
                    ),
                )
                provider_model_id = int(cursor.lastrowid)
        if not api_model_name:
            raise ValueError("api_model_name 不能为空")
        return provider_model_id, api_model_name

    @staticmethod
    def _serialize_model(row: dict[str, Any], lottery_codes: list[str]) -> dict[str, Any]:
        return {
            "model_code": row["model_code"],
            "display_name": row["display_name"],
            "provider": row["provider_code"],
            "api_format": row.get("api_format") or "openai_compatible",
            "provider_model_id": row.get("provider_model_id"),
            "provider_model_name": row.get("provider_model_name") or "",
            "api_model_name": row.get("api_model_name") or row.get("provider_model_name") or "",
            "base_url": row.get("base_url") or DEFAULT_BASE_URL,
            "api_key": row.get("api_key") or "",
            "app_code": row.get("app_code") or "",
            "temperature": row.get("temperature"),
            "is_active": bool(row.get("is_active")),
            "is_deleted": bool(row.get("is_deleted")),
            "lottery_codes": lottery_codes or ["dlt"],
            "updated_at": row.get("updated_at") or "",
        }

    @staticmethod
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

    @staticmethod
    def _replace_provider_options(cursor, provider_id: int, extra_options: dict[str, Any]) -> None:
        cursor.execute("DELETE FROM model_provider_option WHERE provider_id = ?", (provider_id,))
        for option_key, option_value in sorted(extra_options.items()):
            cursor.execute(
                """
                INSERT INTO model_provider_option (provider_id, option_key, option_value)
                VALUES (?, ?, ?)
                """,
                (provider_id, str(option_key), json.dumps(option_value, ensure_ascii=False)),
            )

    @staticmethod
    def _optional_str(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _normalize_lottery_codes(value: Any) -> list[str]:
        if value is None:
            return ["dlt"]
        items = value if isinstance(value, list) else [value]
        normalized: list[str] = []
        for item in items:
            try:
                code = normalize_lottery_code(str(item))
            except ValueError:
                continue
            if code not in normalized:
                normalized.append(code)
        return normalized or ["dlt"]

    @staticmethod
    def _normalize_base_url(value: Any, provider_default_base_url: str, provider_code: str) -> str:
        text = str(value or "").strip()
        if text:
            return text
        if provider_default_base_url:
            return provider_default_base_url
        if provider_code == "lmstudio":
            return LMSTUDIO_BASE_URL
        return DEEPSEEK_BASE_URL if provider_code == "deepseek" else DEFAULT_BASE_URL

    @staticmethod
    def _validate_payload(payload: dict[str, Any], *, is_create: bool) -> None:
        required_fields = ("display_name", "provider")
        if is_create and not str(payload.get("model_code") or "").strip():
            raise ValueError("model_code 不能为空")
        for field_name in required_fields:
            if not str(payload.get(field_name) or "").strip():
                raise ValueError(f"{field_name} 不能为空")
        provider = str(payload.get("provider") or "").strip()
        if not provider:
            raise ValueError("provider 不能为空")
        api_format = str(payload.get("api_format") or "").strip().lower()
        if api_format and api_format not in SUPPORTED_API_FORMATS:
            raise ValueError("不支持的接口格式")
        if not str(payload.get("api_model_name") or "").strip() and not str(payload.get("provider_model_id") or "").strip():
            raise ValueError("api_model_name 不能为空")
        try:
            float(payload.get("temperature"))
        except (TypeError, ValueError) as exc:
            raise ValueError("temperature 必须是数字") from exc
        lottery_codes = payload.get("lottery_codes")
        if lottery_codes is not None:
            normalized_lottery_codes = ModelRepository._normalize_lottery_codes(lottery_codes)
            if not normalized_lottery_codes:
                raise ValueError("至少选择一个适用彩种")
            for code in normalized_lottery_codes:
                if code not in SUPPORTED_LOTTERY_CODES:
                    raise ValueError(f"不支持的彩种: {code}")
        return
