from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from backend.app.db.connection import get_connection
from backend.app.time_utils import ensure_timestamp


class ExpertRepository:
    def list_experts(self, *, include_deleted: bool = False, lottery_code: str | None = None) -> list[dict[str, Any]]:
        conditions: list[str] = []
        params: list[Any] = []
        if not include_deleted:
            conditions.append("is_deleted = 0")
        if lottery_code:
            conditions.append("lottery_code = ?")
            params.append(str(lottery_code).strip().lower())
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT *
                    FROM expert_profile
                    {where_clause}
                    ORDER BY is_active DESC, updated_at DESC, id DESC
                    """,
                    tuple(params),
                )
                rows = cursor.fetchall()
        return [self._serialize_expert_row(row) for row in rows]

    def get_expert(self, expert_code: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM expert_profile WHERE expert_code = ? LIMIT 1", (str(expert_code).strip(),))
                row = cursor.fetchone()
        return self._serialize_expert_row(row) if row else None

    def create_expert(self, payload: dict[str, Any]) -> dict[str, Any]:
        expert_code = str(payload.get("expert_code") or "").strip()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM expert_profile WHERE expert_code = ?", (expert_code,))
                if cursor.fetchone():
                    raise ValueError(f"专家编码已存在: {expert_code}")
                cursor.execute(
                    """
                    INSERT INTO expert_profile (
                        expert_code,
                        display_name,
                        bio,
                        model_code,
                        lottery_code,
                        history_window_count,
                        is_active,
                        is_deleted,
                        config_json
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        expert_code,
                        str(payload.get("display_name") or "").strip(),
                        self._optional_str(payload.get("bio")),
                        str(payload.get("model_code") or "").strip(),
                        str(payload.get("lottery_code") or "dlt").strip().lower(),
                        int(payload.get("history_window_count") or 50),
                        1 if bool(payload.get("is_active", True)) else 0,
                        0,
                        self._dump_json(payload.get("config") or {}),
                    ),
                )
        return self.get_expert(expert_code) or {}

    def update_expert(self, expert_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        next_code = str(payload.get("expert_code") or "").strip() or str(expert_code).strip()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id FROM expert_profile WHERE expert_code = ?", (str(expert_code).strip(),))
                row = cursor.fetchone()
                if not row:
                    raise KeyError(expert_code)
                if next_code != str(expert_code).strip():
                    cursor.execute("SELECT 1 FROM expert_profile WHERE expert_code = ?", (next_code,))
                    if cursor.fetchone():
                        raise ValueError(f"专家编码已存在: {next_code}")
                cursor.execute(
                    """
                    UPDATE expert_profile
                    SET expert_code = ?,
                        display_name = ?,
                        bio = ?,
                        model_code = ?,
                        lottery_code = ?,
                        history_window_count = ?,
                        is_active = ?,
                        config_json = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE expert_code = ?
                    """,
                    (
                        next_code,
                        str(payload.get("display_name") or "").strip(),
                        self._optional_str(payload.get("bio")),
                        str(payload.get("model_code") or "").strip(),
                        str(payload.get("lottery_code") or "dlt").strip().lower(),
                        int(payload.get("history_window_count") or 50),
                        1 if bool(payload.get("is_active", True)) else 0,
                        self._dump_json(payload.get("config") or {}),
                        str(expert_code).strip(),
                    ),
                )
        return self.get_expert(next_code) or {}

    def set_expert_active(self, expert_code: str, is_active: bool) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE expert_profile
                    SET is_active = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE expert_code = ?
                    """,
                    (1 if is_active else 0, str(expert_code).strip()),
                )
                if cursor.rowcount == 0:
                    raise KeyError(expert_code)
        return self.get_expert(expert_code) or {}

    def soft_delete_expert(self, expert_code: str) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE expert_profile
                    SET is_deleted = 1, is_active = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE expert_code = ?
                    """,
                    (str(expert_code).strip(),),
                )
                if cursor.rowcount == 0:
                    raise KeyError(expert_code)
        return self.get_expert(expert_code) or {}

    def restore_expert(self, expert_code: str) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE expert_profile
                    SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE expert_code = ?
                    """,
                    (str(expert_code).strip(),),
                )
                if cursor.rowcount == 0:
                    raise KeyError(expert_code)
        return self.get_expert(expert_code) or {}

    def upsert_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        lottery_code = str(payload.get("lottery_code") or "dlt").strip().lower()
        target_period = str(payload.get("target_period") or "").strip()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO expert_prediction_batch (
                        task_id,
                        lottery_code,
                        target_period,
                        prediction_date,
                        status,
                        summary_json
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        task_id = VALUES(task_id),
                        prediction_date = VALUES(prediction_date),
                        status = VALUES(status),
                        summary_json = VALUES(summary_json),
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        str(payload.get("task_id") or "").strip(),
                        lottery_code,
                        target_period,
                        str(payload.get("prediction_date") or "").strip(),
                        str(payload.get("status") or "queued").strip(),
                        self._dump_json(payload.get("summary") or {}),
                    ),
                )
        return self.get_batch_by_period(lottery_code=lottery_code, target_period=target_period) or {}

    def get_batch_by_period(self, *, lottery_code: str, target_period: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT *
                    FROM expert_prediction_batch
                    WHERE lottery_code = ? AND target_period = ?
                    LIMIT 1
                    """,
                    (str(lottery_code).strip().lower(), str(target_period).strip()),
                )
                row = cursor.fetchone()
        return self._serialize_batch_row(row) if row else None

    def get_batch_by_task_id(self, task_id: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM expert_prediction_batch WHERE task_id = ? LIMIT 1", (str(task_id).strip(),))
                row = cursor.fetchone()
        return self._serialize_batch_row(row) if row else None

    def update_batch(self, task_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        assignments: list[str] = []
        params: list[Any] = []
        if "status" in updates:
            assignments.append("status = ?")
            params.append(str(updates.get("status") or "").strip())
        if "summary" in updates:
            assignments.append("summary_json = ?")
            params.append(self._dump_json(updates.get("summary") or {}))
        if not assignments:
            return self.get_batch_by_task_id(task_id) or {}
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE expert_prediction_batch
                    SET {", ".join(assignments)},
                        updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = ?
                    """,
                    tuple(params + [str(task_id).strip()]),
                )
        return self.get_batch_by_task_id(task_id) or {}

    def upsert_result(self, payload: dict[str, Any]) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO expert_prediction_result (
                        batch_id,
                        expert_id,
                        expert_code,
                        lottery_code,
                        target_period,
                        status,
                        error_message,
                        prompt_snapshot,
                        precompute_json,
                        tiers_json,
                        analysis_json,
                        generated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        error_message = VALUES(error_message),
                        prompt_snapshot = VALUES(prompt_snapshot),
                        precompute_json = VALUES(precompute_json),
                        tiers_json = VALUES(tiers_json),
                        analysis_json = VALUES(analysis_json),
                        generated_at = VALUES(generated_at),
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        int(payload.get("batch_id") or 0),
                        int(payload.get("expert_id") or 0),
                        str(payload.get("expert_code") or "").strip(),
                        str(payload.get("lottery_code") or "dlt").strip().lower(),
                        str(payload.get("target_period") or "").strip(),
                        str(payload.get("status") or "queued").strip(),
                        self._optional_str(payload.get("error_message")),
                        self._optional_str(payload.get("prompt_snapshot")),
                        self._dump_json(payload.get("precompute") or {}),
                        self._dump_json(payload.get("tiers") or {}),
                        self._dump_json(payload.get("analysis") or {}),
                        self._serialize_datetime(payload.get("generated_at")),
                    ),
                )
        batch_id = int(payload.get("batch_id") or 0)
        expert_id = int(payload.get("expert_id") or 0)
        return self.get_result(batch_id=batch_id, expert_id=expert_id) or {}

    def get_result(self, *, batch_id: int, expert_id: int) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT *
                    FROM expert_prediction_result
                    WHERE batch_id = ? AND expert_id = ?
                    LIMIT 1
                    """,
                    (int(batch_id), int(expert_id)),
                )
                row = cursor.fetchone()
        return self._serialize_result_row(row) if row else None

    def list_results_by_period(self, *, lottery_code: str, target_period: str) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        r.*,
                        e.display_name,
                        e.bio,
                        e.is_active,
                        e.is_deleted
                    FROM expert_prediction_result r
                    INNER JOIN expert_profile e ON e.id = r.expert_id
                    WHERE r.lottery_code = ? AND r.target_period = ?
                    ORDER BY e.updated_at DESC, e.id DESC
                    """,
                    (str(lottery_code).strip().lower(), str(target_period).strip()),
                )
                rows = cursor.fetchall()
        return [self._serialize_result_row(row) for row in rows]

    def list_result_summaries_by_period(self, *, lottery_code: str, target_period: str) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        r.id,
                        r.batch_id,
                        r.expert_id,
                        r.expert_code,
                        r.lottery_code,
                        r.target_period,
                        r.status,
                        r.error_message,
                        r.generated_at,
                        r.updated_at,
                        r.created_at,
                        e.display_name,
                        e.bio,
                        e.model_code,
                        e.is_active,
                        e.is_deleted
                    FROM expert_prediction_result r
                    INNER JOIN expert_profile e ON e.id = r.expert_id
                    WHERE r.lottery_code = ? AND r.target_period = ?
                    ORDER BY e.updated_at DESC, e.id DESC
                    """,
                    (str(lottery_code).strip().lower(), str(target_period).strip()),
                )
                rows = cursor.fetchall()
        return [self._serialize_result_row(row) for row in rows]

    def list_history_results(
        self,
        *,
        lottery_code: str,
        expert_code: str | None = None,
        period_query: str | None = None,
    ) -> list[dict[str, Any]]:
        conditions = ["r.lottery_code = ?", "r.status = 'succeeded'"]
        params: list[Any] = [str(lottery_code).strip().lower()]
        normalized_expert_code = str(expert_code or "").strip()
        if normalized_expert_code:
            conditions.append("r.expert_code = ?")
            params.append(normalized_expert_code)
        normalized_period_query = str(period_query or "").strip()
        if normalized_period_query:
            conditions.append("r.target_period LIKE ?")
            params.append(f"%{normalized_period_query}%")
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        r.*,
                        e.display_name,
                        e.bio,
                        e.model_code,
                        e.is_active,
                        e.is_deleted
                    FROM expert_prediction_result r
                    INNER JOIN expert_profile e ON e.id = r.expert_id
                    WHERE {" AND ".join(conditions)}
                    ORDER BY CAST(r.target_period AS UNSIGNED) DESC, r.target_period DESC, e.updated_at DESC, e.id DESC
                    """,
                    tuple(params),
                )
                rows = cursor.fetchall()
        return [self._serialize_result_row(row) for row in rows]

    @staticmethod
    def _optional_str(value: Any) -> str | None:
        normalized = str(value or "").strip()
        return normalized or None

    @staticmethod
    def _dump_json(value: Any) -> str:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)

    @staticmethod
    def _load_json(value: Any, default: Any) -> Any:
        if value is None or str(value).strip() == "":
            return default
        try:
            return json.loads(str(value))
        except Exception:
            return default

    @staticmethod
    def _serialize_datetime(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%d %H:%M:%S")
        normalized = str(value).strip()
        return normalized or None

    @staticmethod
    def _serialize_db_timestamp(value: Any) -> int | None:
        return ensure_timestamp(value, assume_beijing=True)

    def _serialize_expert_row(self, row: dict[str, Any]) -> dict[str, Any]:
        config = self._load_json(row.get("config_json"), {})
        return {
            "id": int(row.get("id") or 0),
            "expert_code": str(row.get("expert_code") or ""),
            "display_name": str(row.get("display_name") or ""),
            "bio": str(row.get("bio") or ""),
            "model_code": str(row.get("model_code") or ""),
            "lottery_code": str(row.get("lottery_code") or "dlt"),
            "history_window_count": int(row.get("history_window_count") or 50),
            "is_active": bool(row.get("is_active")),
            "is_deleted": bool(row.get("is_deleted")),
            "config": config if isinstance(config, dict) else {},
            "updated_at": self._serialize_db_timestamp(row.get("updated_at")) or 0,
            "created_at": self._serialize_db_timestamp(row.get("created_at")) or 0,
        }

    def _serialize_batch_row(self, row: dict[str, Any]) -> dict[str, Any]:
        summary = self._load_json(row.get("summary_json"), {})
        return {
            "id": int(row.get("id") or 0),
            "task_id": str(row.get("task_id") or ""),
            "lottery_code": str(row.get("lottery_code") or "dlt"),
            "target_period": str(row.get("target_period") or ""),
            "prediction_date": str(row.get("prediction_date") or ""),
            "status": str(row.get("status") or "queued"),
            "summary": summary if isinstance(summary, dict) else {},
            "updated_at": self._serialize_db_timestamp(row.get("updated_at")) or 0,
            "created_at": self._serialize_db_timestamp(row.get("created_at")) or 0,
        }

    def _serialize_result_row(self, row: dict[str, Any]) -> dict[str, Any]:
        precompute = self._load_json(row.get("precompute_json"), {})
        tiers = self._load_json(row.get("tiers_json"), {})
        analysis = self._load_json(row.get("analysis_json"), {})
        return {
            "id": int(row.get("id") or 0),
            "batch_id": int(row.get("batch_id") or 0),
            "expert_id": int(row.get("expert_id") or 0),
            "expert_code": str(row.get("expert_code") or ""),
            "display_name": str(row.get("display_name") or ""),
            "bio": str(row.get("bio") or ""),
            "model_code": str(row.get("model_code") or ""),
            "lottery_code": str(row.get("lottery_code") or "dlt"),
            "target_period": str(row.get("target_period") or ""),
            "status": str(row.get("status") or "queued"),
            "error_message": self._optional_str(row.get("error_message")),
            "prompt_snapshot": str(row.get("prompt_snapshot") or ""),
            "precompute": precompute if isinstance(precompute, dict) else {},
            "tiers": tiers if isinstance(tiers, dict) else {},
            "analysis": analysis if isinstance(analysis, dict) else {},
            "generated_at": self._serialize_db_timestamp(row.get("generated_at")),
            "updated_at": self._serialize_db_timestamp(row.get("updated_at")) or 0,
            "created_at": self._serialize_db_timestamp(row.get("created_at")) or 0,
            "is_active": bool(row.get("is_active")) if "is_active" in row else True,
            "is_deleted": bool(row.get("is_deleted")) if "is_deleted" in row else False,
        }
