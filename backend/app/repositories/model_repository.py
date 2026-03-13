from __future__ import annotations

from typing import Any

from backend.app.db.connection import ensure_schema, get_connection
from backend.core.model_config import DEFAULT_BASE_URL, SUPPORTED_PROVIDERS, bootstrap_default_models


PROVIDER_LABELS = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "gemini": "Gemini",
    "openai_compatible": "OpenAI Compatible",
}


class ModelRepository:
    def list_models(self, include_deleted: bool = False) -> list[dict[str, Any]]:
        ensure_schema()
        bootstrap_default_models()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                rows = self._fetch_models(cursor, include_deleted=include_deleted)
                tags_by_code = self._fetch_tags(cursor, [row["model_code"] for row in rows])
        return [self._serialize_model(row, tags_by_code.get(row["model_code"], [])) for row in rows]

    def get_model(self, model_code: str) -> dict[str, Any] | None:
        ensure_schema()
        bootstrap_default_models()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                rows = self._fetch_models(cursor, include_deleted=True, model_codes=[model_code])
                if not rows:
                    return None
                tags_by_code = self._fetch_tags(cursor, [model_code])
        return self._serialize_model(rows[0], tags_by_code.get(model_code, []))

    def create_model(self, payload: dict[str, Any]) -> dict[str, Any]:
        ensure_schema()
        bootstrap_default_models()
        model_code = str(payload["model_code"]).strip()
        self._validate_payload(payload, is_create=True)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM ai_model WHERE model_code = ?", (model_code,))
                if cursor.fetchone():
                    raise ValueError(f"模型编码已存在: {model_code}")
                provider_id = self._upsert_provider(cursor, str(payload["provider"]))
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
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (
                        model_code,
                        str(payload["display_name"]).strip(),
                        provider_id,
                        str(payload["api_model_name"]).strip(),
                        self._optional_str(payload.get("version")),
                        1 if payload.get("is_active", True) else 0,
                        self._normalize_base_url(payload.get("base_url")),
                        self._optional_str(payload.get("api_key")) or "",
                        self._optional_str(payload.get("app_code")) or "",
                        payload.get("temperature"),
                        0,
                    ),
                )
                cursor.execute("SELECT id FROM ai_model WHERE model_code = ?", (model_code,))
                model_id = int(cursor.fetchone()["id"])
                self._save_tags(cursor, model_id, self._normalize_tags(payload.get("tags")))
        return self.get_model(model_code) or {}

    def update_model(self, model_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        ensure_schema()
        bootstrap_default_models()
        self._validate_payload(payload, is_create=False)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id FROM ai_model WHERE model_code = ?", (model_code,))
                row = cursor.fetchone()
                if not row:
                    raise KeyError(model_code)
                model_id = int(row["id"])
                provider_id = self._upsert_provider(cursor, str(payload["provider"]))
                cursor.execute(
                    """
                    UPDATE ai_model
                    SET display_name = ?,
                        provider_id = ?,
                        api_model_name = ?,
                        version = ?,
                        is_active = ?,
                        base_url = ?,
                        api_key = ?,
                        app_code = ?,
                        temperature = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE model_code = ?
                    """,
                    (
                        str(payload["display_name"]).strip(),
                        provider_id,
                        str(payload["api_model_name"]).strip(),
                        self._optional_str(payload.get("version")),
                        1 if payload.get("is_active", True) else 0,
                        self._normalize_base_url(payload.get("base_url")),
                        self._optional_str(payload.get("api_key")) or "",
                        self._optional_str(payload.get("app_code")) or "",
                        payload.get("temperature"),
                        model_code,
                    ),
                )
                self._save_tags(cursor, model_id, self._normalize_tags(payload.get("tags")))
        return self.get_model(model_code) or {}

    def set_model_active(self, model_code: str, is_active: bool) -> dict[str, Any]:
        return self._update_flag(model_code, "is_active", 1 if is_active else 0)

    def soft_delete_model(self, model_code: str) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE ai_model
                    SET is_deleted = 1, is_active = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE model_code = ?
                    """,
                    (model_code,),
                )
                if cursor.rowcount == 0:
                    raise KeyError(model_code)
        return self.get_model(model_code) or {}

    def restore_model(self, model_code: str) -> dict[str, Any]:
        return self._update_flag(model_code, "is_deleted", 0)

    def list_providers(self) -> list[dict[str, str]]:
        return [
            {"code": code, "name": PROVIDER_LABELS[code]}
            for code in SUPPORTED_PROVIDERS
        ]

    def _update_flag(self, model_code: str, field_name: str, value: int) -> dict[str, Any]:
        ensure_schema()
        bootstrap_default_models()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE ai_model
                    SET {field_name} = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE model_code = ?
                    """,
                    (value, model_code),
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
                am.api_model_name,
                am.version,
                am.base_url,
                am.api_key,
                am.app_code,
                am.temperature,
                am.is_active,
                am.is_deleted,
                am.updated_at
            FROM ai_model am
            INNER JOIN model_provider mp ON mp.id = am.provider_id
        """
        params: list[Any] = []
        where_clauses: list[str] = []
        if not include_deleted:
            where_clauses.append("am.is_deleted = 0")
        if model_codes:
            placeholders = ", ".join("?" for _ in model_codes)
            where_clauses.append(f"am.model_code IN ({placeholders})")
            params.extend(model_codes)
        if where_clauses:
            sql += " WHERE " + " AND ".join(where_clauses)
        sql += " ORDER BY am.is_active DESC, am.updated_at DESC, am.model_code ASC"
        cursor.execute(sql, tuple(params))
        return cursor.fetchall()

    def _fetch_tags(self, cursor, model_codes: list[str]) -> dict[str, list[str]]:
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

    def _save_tags(self, cursor, model_id: int, tags: list[str]) -> None:
        cursor.execute("DELETE FROM ai_model_tag WHERE model_id = ?", (model_id,))
        for tag in tags:
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
                """,
                (model_id, tag_id),
            )

    def _upsert_provider(self, cursor, provider_code: str) -> int:
        provider_name = PROVIDER_LABELS[provider_code]
        cursor.execute(
            """
            INSERT INTO model_provider (provider_code, provider_name, base_url)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                provider_name = VALUES(provider_name),
                base_url = COALESCE(VALUES(base_url), base_url)
            """,
            (provider_code, provider_name, DEFAULT_BASE_URL),
        )
        cursor.execute("SELECT id FROM model_provider WHERE provider_code = ?", (provider_code,))
        return int(cursor.fetchone()["id"])

    @staticmethod
    def _serialize_model(row: dict[str, Any], tags: list[str]) -> dict[str, Any]:
        return {
            "model_code": row["model_code"],
            "display_name": row["display_name"],
            "provider": row["provider_code"],
            "api_model_name": row.get("api_model_name") or "",
            "version": row.get("version") or "",
            "tags": tags,
            "base_url": row.get("base_url") or DEFAULT_BASE_URL,
            "api_key": row.get("api_key") or "",
            "app_code": row.get("app_code") or "",
            "temperature": row.get("temperature"),
            "is_active": bool(row.get("is_active")),
            "is_deleted": bool(row.get("is_deleted")),
            "updated_at": row.get("updated_at") or "",
        }

    @staticmethod
    def _optional_str(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _normalize_tags(value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            parts = value.split(",")
        else:
            parts = value
        tags: list[str] = []
        for item in parts:
            tag = str(item).strip()
            if tag and tag not in tags:
                tags.append(tag)
        return tags

    @staticmethod
    def _normalize_base_url(value: Any) -> str:
        text = str(value or "").strip()
        return text or DEFAULT_BASE_URL

    @staticmethod
    def _validate_payload(payload: dict[str, Any], *, is_create: bool) -> None:
        required_fields = ("display_name", "provider", "api_model_name")
        if is_create and not str(payload.get("model_code") or "").strip():
            raise ValueError("model_code 不能为空")
        for field_name in required_fields:
            if not str(payload.get(field_name) or "").strip():
                raise ValueError(f"{field_name} 不能为空")
        provider = str(payload.get("provider") or "")
        if provider not in SUPPORTED_PROVIDERS:
            raise ValueError(f"不支持的 provider: {provider}")
        temperature = payload.get("temperature")
        if temperature in ("", None):
            return
        try:
            float(temperature)
        except (TypeError, ValueError) as exc:
            raise ValueError("temperature 必须是数字") from exc
