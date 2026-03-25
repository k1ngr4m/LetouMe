from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from backend.app.db.connection import get_connection


DATETIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    for fmt in (DATETIME_FORMAT, "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _format_datetime(value: Any) -> str | None:
    parsed = _parse_datetime(value)
    return parsed.strftime(DATETIME_FORMAT) if parsed else None


class ScheduleRepository:
    def list_tasks(self) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT *
                    FROM scheduled_task
                    ORDER BY is_active DESC, next_run_at ASC, created_at DESC
                    """
                )
                return [self._serialize_task(row) for row in cursor.fetchall()]

    def get_task(self, task_code: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM scheduled_task WHERE task_code = ?", (task_code,))
                row = cursor.fetchone()
        return self._serialize_task(row) if row else None

    def create_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO scheduled_task (
                        task_code,
                        task_name,
                        task_type,
                        lottery_code,
                        model_codes_json,
                        generation_mode,
                        overwrite_existing,
                        schedule_mode,
                        preset_type,
                        time_of_day,
                        weekdays_json,
                        cron_expression,
                        is_active,
                        next_run_at,
                        last_run_at,
                        last_run_status,
                        last_error_message,
                        last_task_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["task_code"],
                        payload["task_name"],
                        payload["task_type"],
                        payload["lottery_code"],
                        json.dumps(payload.get("model_codes") or [], ensure_ascii=False),
                        payload.get("generation_mode") or "current",
                        1 if payload.get("overwrite_existing") else 0,
                        payload["schedule_mode"],
                        payload.get("preset_type"),
                        payload.get("time_of_day"),
                        json.dumps(payload.get("weekdays") or [], ensure_ascii=False),
                        payload.get("cron_expression"),
                        1 if payload.get("is_active", True) else 0,
                        _parse_datetime(payload.get("next_run_at")),
                        _parse_datetime(payload.get("last_run_at")),
                        payload.get("last_run_status"),
                        payload.get("last_error_message"),
                        payload.get("last_task_id"),
                    ),
                )
        return self.get_task(str(payload["task_code"])) or {}

    def update_task(self, task_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE scheduled_task
                    SET task_name = ?,
                        task_type = ?,
                        lottery_code = ?,
                        model_codes_json = ?,
                        generation_mode = ?,
                        overwrite_existing = ?,
                        schedule_mode = ?,
                        preset_type = ?,
                        time_of_day = ?,
                        weekdays_json = ?,
                        cron_expression = ?,
                        is_active = ?,
                        next_run_at = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE task_code = ?
                    """,
                    (
                        payload["task_name"],
                        payload["task_type"],
                        payload["lottery_code"],
                        json.dumps(payload.get("model_codes") or [], ensure_ascii=False),
                        payload.get("generation_mode") or "current",
                        1 if payload.get("overwrite_existing") else 0,
                        payload["schedule_mode"],
                        payload.get("preset_type"),
                        payload.get("time_of_day"),
                        json.dumps(payload.get("weekdays") or [], ensure_ascii=False),
                        payload.get("cron_expression"),
                        1 if payload.get("is_active", True) else 0,
                        _parse_datetime(payload.get("next_run_at")),
                        task_code,
                    ),
                )
                if cursor.rowcount == 0:
                    raise KeyError(task_code)
        return self.get_task(task_code) or {}

    def set_task_active(self, task_code: str, is_active: bool, next_run_at: str | None) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE scheduled_task
                    SET is_active = ?,
                        next_run_at = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE task_code = ?
                    """,
                    (1 if is_active else 0, _parse_datetime(next_run_at), task_code),
                )
                if cursor.rowcount == 0:
                    raise KeyError(task_code)
        return self.get_task(task_code) or {}

    def set_task_model_codes(
        self,
        task_code: str,
        model_codes: list[str],
        *,
        deactivate_if_empty: bool = False,
    ) -> dict[str, Any]:
        normalized_codes = [str(code).strip() for code in model_codes if str(code).strip()]
        next_active = 0 if (deactivate_if_empty and not normalized_codes) else None
        with get_connection() as connection:
            with connection.cursor() as cursor:
                if next_active is None:
                    cursor.execute(
                        """
                        UPDATE scheduled_task
                        SET model_codes_json = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE task_code = ?
                        """,
                        (json.dumps(normalized_codes, ensure_ascii=False), task_code),
                    )
                else:
                    cursor.execute(
                        """
                        UPDATE scheduled_task
                        SET model_codes_json = ?,
                            is_active = ?,
                            next_run_at = NULL,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE task_code = ?
                        """,
                        (json.dumps(normalized_codes, ensure_ascii=False), next_active, task_code),
                    )
                if cursor.rowcount == 0:
                    raise KeyError(task_code)
        return self.get_task(task_code) or {}

    def delete_task(self, task_code: str) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM scheduled_task WHERE task_code = ?", (task_code,))
                if cursor.rowcount == 0:
                    raise KeyError(task_code)

    def update_run_state(self, task_code: str, updates: dict[str, Any]) -> dict[str, Any]:
        fields = {
            "next_run_at": _parse_datetime(updates.get("next_run_at")),
            "last_run_at": _parse_datetime(updates.get("last_run_at")),
            "last_run_status": updates.get("last_run_status"),
            "last_error_message": updates.get("last_error_message"),
            "last_task_id": updates.get("last_task_id"),
        }
        assignments = ", ".join(f"{column} = ?" for column in fields)
        params = tuple(fields.values()) + (task_code,)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE scheduled_task
                    SET {assignments},
                        updated_at = CURRENT_TIMESTAMP
                    WHERE task_code = ?
                    """,
                    params,
                )
                if cursor.rowcount == 0:
                    raise KeyError(task_code)
        return self.get_task(task_code) or {}

    def list_due_tasks(self, due_before: datetime) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT *
                    FROM scheduled_task
                    WHERE is_active = 1
                      AND next_run_at IS NOT NULL
                      AND next_run_at <= ?
                    ORDER BY next_run_at ASC, id ASC
                    """,
                    (due_before,),
                )
                return [self._serialize_task(row) for row in cursor.fetchall()]

    def _serialize_task(self, row: dict[str, Any]) -> dict[str, Any]:
        model_codes = json.loads(row.get("model_codes_json") or "[]")
        weekdays = json.loads(row.get("weekdays_json") or "[]")
        return {
            "task_code": str(row["task_code"]),
            "task_name": str(row["task_name"]),
            "task_type": str(row["task_type"]),
            "lottery_code": str(row.get("lottery_code") or "dlt"),
            "model_codes": [str(code) for code in model_codes],
            "generation_mode": str(row.get("generation_mode") or "current"),
            "overwrite_existing": bool(row.get("overwrite_existing")),
            "schedule_mode": str(row.get("schedule_mode") or "preset"),
            "preset_type": str(row["preset_type"]) if row.get("preset_type") else None,
            "time_of_day": str(row["time_of_day"]) if row.get("time_of_day") else None,
            "weekdays": [int(value) for value in weekdays],
            "cron_expression": str(row["cron_expression"]) if row.get("cron_expression") else None,
            "is_active": bool(row.get("is_active")),
            "next_run_at": _format_datetime(row.get("next_run_at")),
            "last_run_at": _format_datetime(row.get("last_run_at")),
            "last_run_status": str(row["last_run_status"]) if row.get("last_run_status") else None,
            "last_error_message": str(row["last_error_message"]) if row.get("last_error_message") else None,
            "last_task_id": str(row["last_task_id"]) if row.get("last_task_id") else None,
            "created_at": _format_datetime(row.get("created_at")),
            "updated_at": _format_datetime(row.get("updated_at")),
        }
