from __future__ import annotations
from datetime import datetime
from typing import Any

from backend.app.db.connection import get_connection
from backend.app.time_utils import ensure_timestamp, now_ts


class ScheduleRepository:
    CLAIMED_RUN_STATUS = "claiming"

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
                rows = cursor.fetchall()
                task_ids = [int(row["id"]) for row in rows]
                model_codes_by_task = self._load_task_model_codes(cursor, task_ids)
                weekdays_by_task = self._load_task_weekdays(cursor, task_ids)
                return [
                    self._serialize_task(
                        row,
                        model_codes=model_codes_by_task.get(int(row["id"])),
                        weekdays=weekdays_by_task.get(int(row["id"])),
                    )
                    for row in rows
                ]

    def get_task(self, task_code: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM scheduled_task WHERE task_code = ?", (task_code,))
                row = cursor.fetchone()
                if not row:
                    return None
                task_id = int(row["id"])
                return self._serialize_task(
                    row,
                    model_codes=self._load_task_model_codes(cursor, [task_id]).get(task_id),
                    weekdays=self._load_task_weekdays(cursor, [task_id]).get(task_id),
                )

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
                        generation_mode,
                        prediction_play_mode,
                        overwrite_existing,
                        schedule_mode,
                        preset_type,
                        time_of_day,
                        cron_expression,
                        is_active,
                        next_run_at,
                        last_run_at,
                        last_run_status,
                        last_error_message,
                        last_task_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["task_code"],
                        payload["task_name"],
                        payload["task_type"],
                        payload["lottery_code"],
                        payload.get("generation_mode") or "current",
                        payload.get("prediction_play_mode") or "direct",
                        1 if payload.get("overwrite_existing") else 0,
                        payload["schedule_mode"],
                        payload.get("preset_type"),
                        payload.get("time_of_day"),
                        payload.get("cron_expression"),
                        1 if payload.get("is_active", True) else 0,
                        ensure_timestamp(payload.get("next_run_at")),
                        ensure_timestamp(payload.get("last_run_at")),
                        payload.get("last_run_status"),
                        payload.get("last_error_message"),
                        payload.get("last_task_id"),
                    ),
                )
                task_id = int(cursor.lastrowid)
                self._replace_task_models(cursor, task_id, payload.get("model_codes") or [])
                self._replace_task_weekdays(cursor, task_id, payload.get("weekdays") or [])
        return self.get_task(str(payload["task_code"])) or {}

    def update_task(self, task_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                task_id = self._get_task_id(cursor, task_code)
                cursor.execute(
                    """
                    UPDATE scheduled_task
                    SET task_name = ?,
                        task_type = ?,
                        lottery_code = ?,
                        generation_mode = ?,
                        prediction_play_mode = ?,
                        overwrite_existing = ?,
                        schedule_mode = ?,
                        preset_type = ?,
                        time_of_day = ?,
                        cron_expression = ?,
                        is_active = ?,
                        next_run_at = ?,
                        updated_at = ?
                    WHERE task_code = ?
                    """,
                    (
                        payload["task_name"],
                        payload["task_type"],
                        payload["lottery_code"],
                        payload.get("generation_mode") or "current",
                        payload.get("prediction_play_mode") or "direct",
                        1 if payload.get("overwrite_existing") else 0,
                        payload["schedule_mode"],
                        payload.get("preset_type"),
                        payload.get("time_of_day"),
                        payload.get("cron_expression"),
                        1 if payload.get("is_active", True) else 0,
                        ensure_timestamp(payload.get("next_run_at")),
                        now_ts(),
                        task_code,
                    ),
                )
                self._replace_task_models(cursor, task_id, payload.get("model_codes") or [])
                self._replace_task_weekdays(cursor, task_id, payload.get("weekdays") or [])
        return self.get_task(task_code) or {}

    def set_task_active(self, task_code: str, is_active: bool, next_run_at: int | None) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE scheduled_task
                    SET is_active = ?,
                        next_run_at = ?,
                        updated_at = ?
                    WHERE task_code = ?
                    """,
                    (1 if is_active else 0, ensure_timestamp(next_run_at), now_ts(), task_code),
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
                task_id = self._get_task_id(cursor, task_code)
                if next_active is None:
                    cursor.execute(
                        """
                        UPDATE scheduled_task
                        SET updated_at = ?
                        WHERE task_code = ?
                        """,
                        (now_ts(), task_code),
                    )
                else:
                    cursor.execute(
                        """
                        UPDATE scheduled_task
                        SET is_active = ?,
                            next_run_at = NULL,
                            updated_at = ?
                        WHERE task_code = ?
                        """,
                        (next_active, now_ts(), task_code),
                    )
                self._replace_task_models(cursor, task_id, normalized_codes)
        return self.get_task(task_code) or {}

    def delete_task(self, task_code: str) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM scheduled_task WHERE task_code = ?", (task_code,))
                if cursor.rowcount == 0:
                    raise KeyError(task_code)

    def update_run_state(self, task_code: str, updates: dict[str, Any]) -> dict[str, Any]:
        fields = {
            "next_run_at": ensure_timestamp(updates.get("next_run_at")),
            "last_run_at": ensure_timestamp(updates.get("last_run_at")),
            "last_run_status": updates.get("last_run_status"),
            "last_error_message": updates.get("last_error_message"),
            "last_task_id": updates.get("last_task_id"),
        }
        assignments = ", ".join(f"{column} = ?" for column in fields)
        params = tuple(fields.values()) + (now_ts(), task_code)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE scheduled_task
                    SET {assignments},
                        updated_at = ?
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
                # Keep due-task scan lean: use id-only read first, then fetch full rows for matched ids.
                # This avoids wide-row SELECT * scans on the hot scheduler polling path.
                due_task_ids = self._find_due_task_ids(cursor, due_before=due_before)
                return self._fetch_tasks_with_relations(cursor, due_task_ids)

    def claim_due_tasks(self, *, due_before: datetime, claim_until: datetime) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                candidate_task_ids = self._find_due_task_ids(cursor, due_before=due_before)
                if not candidate_task_ids:
                    return []

                claimed_ids: list[int] = []
                for task_id in candidate_task_ids:
                    cursor.execute(
                        """
                        UPDATE scheduled_task
                        SET next_run_at = ?,
                            last_run_status = ?,
                            updated_at = ?
                        WHERE id = ?
                          AND is_active = 1
                          AND next_run_at IS NOT NULL
                          AND next_run_at <= ?
                        """,
                        (
                            ensure_timestamp(claim_until),
                            self.CLAIMED_RUN_STATUS,
                            now_ts(),
                            task_id,
                            ensure_timestamp(due_before),
                        ),
                    )
                    if cursor.rowcount > 0:
                        claimed_ids.append(task_id)

                return self._fetch_tasks_with_relations(cursor, claimed_ids)

    def _find_due_task_ids(self, cursor: Any, *, due_before: datetime) -> list[int]:
        cursor.execute(
            """
            SELECT id
            FROM scheduled_task
            WHERE is_active = 1
              AND next_run_at IS NOT NULL
              AND next_run_at <= ?
            ORDER BY next_run_at ASC, id ASC
            """,
            (ensure_timestamp(due_before),),
        )
        return [int(row["id"]) for row in cursor.fetchall()]

    def _fetch_tasks_with_relations(self, cursor: Any, task_ids: list[int]) -> list[dict[str, Any]]:
        if not task_ids:
            return []
        placeholders = ", ".join("?" for _ in task_ids)
        cursor.execute(
            f"""
            SELECT *
            FROM scheduled_task
            WHERE id IN ({placeholders})
            ORDER BY next_run_at ASC, id ASC
            """,
            tuple(task_ids),
        )
        rows = cursor.fetchall()
        model_codes_by_task = self._load_task_model_codes(cursor, task_ids)
        weekdays_by_task = self._load_task_weekdays(cursor, task_ids)
        return [
            self._serialize_task(
                row,
                model_codes=model_codes_by_task.get(int(row["id"])),
                weekdays=weekdays_by_task.get(int(row["id"])),
            )
            for row in rows
        ]

    def _serialize_task(
        self,
        row: dict[str, Any],
        *,
        model_codes: list[str] | None = None,
        weekdays: list[int] | None = None,
    ) -> dict[str, Any]:
        model_codes = list(model_codes or [])
        weekdays = list(weekdays or [])
        return {
            "task_code": str(row["task_code"]),
            "task_name": str(row["task_name"]),
            "task_type": str(row["task_type"]),
            "lottery_code": str(row.get("lottery_code") or "dlt"),
            "model_codes": [str(code) for code in model_codes],
            "generation_mode": str(row.get("generation_mode") or "current"),
            "prediction_play_mode": str(row.get("prediction_play_mode") or "direct"),
            "overwrite_existing": bool(row.get("overwrite_existing")),
            "schedule_mode": str(row.get("schedule_mode") or "preset"),
            "preset_type": str(row["preset_type"]) if row.get("preset_type") else None,
            "time_of_day": str(row["time_of_day"]) if row.get("time_of_day") else None,
            "weekdays": [int(value) for value in weekdays],
            "cron_expression": str(row["cron_expression"]) if row.get("cron_expression") else None,
            "is_active": bool(row.get("is_active")),
            "next_run_at": ensure_timestamp(row.get("next_run_at")),
            "last_run_at": ensure_timestamp(row.get("last_run_at")),
            "last_run_status": str(row["last_run_status"]) if row.get("last_run_status") else None,
            "last_error_message": str(row["last_error_message"]) if row.get("last_error_message") else None,
            "last_task_id": str(row["last_task_id"]) if row.get("last_task_id") else None,
            "created_at": ensure_timestamp(row.get("created_at")),
            "updated_at": ensure_timestamp(row.get("updated_at")),
        }

    @staticmethod
    def _get_task_id(cursor, task_code: str) -> int:
        cursor.execute("SELECT id FROM scheduled_task WHERE task_code = ?", (task_code,))
        row = cursor.fetchone()
        if not row:
            raise KeyError(task_code)
        return int(row["id"])

    @staticmethod
    def _resolve_model_ids(cursor, model_codes: list[str]) -> list[tuple[int, str]]:
        normalized_codes = [str(code).strip() for code in model_codes if str(code).strip()]
        if not normalized_codes:
            return []
        placeholders = ", ".join("?" for _ in normalized_codes)
        cursor.execute(
            f"""
            SELECT id, model_code
            FROM ai_model
            WHERE model_code IN ({placeholders}) AND is_deleted = 0
            """,
            tuple(normalized_codes),
        )
        rows = cursor.fetchall()
        row_by_code = {str(row["model_code"]): int(row["id"]) for row in rows}
        missing_codes = [code for code in normalized_codes if code not in row_by_code]
        if missing_codes:
            raise ValueError(f"未知模型: {', '.join(missing_codes)}")
        return [(row_by_code[code], code) for code in normalized_codes]

    def _replace_task_models(self, cursor, task_id: int, model_codes: list[str]) -> None:
        cursor.execute("DELETE FROM scheduled_task_model WHERE task_id = ?", (task_id,))
        for sort_order, (model_id, _) in enumerate(self._resolve_model_ids(cursor, model_codes), start=1):
            cursor.execute(
                """
                INSERT INTO scheduled_task_model (task_id, model_id, sort_order)
                VALUES (?, ?, ?)
                """,
                (task_id, model_id, sort_order),
            )

    @staticmethod
    def _replace_task_weekdays(cursor, task_id: int, weekdays: list[int]) -> None:
        cursor.execute("DELETE FROM scheduled_task_weekday WHERE task_id = ?", (task_id,))
        for weekday in sorted({int(value) for value in weekdays if int(value) >= 0}):
            cursor.execute(
                """
                INSERT INTO scheduled_task_weekday (task_id, weekday)
                VALUES (?, ?)
                """,
                (task_id, weekday),
            )

    @staticmethod
    def _load_task_model_codes(cursor, task_ids: list[int]) -> dict[int, list[str]]:
        if not task_ids:
            return {}
        placeholders = ", ".join("?" for _ in task_ids)
        cursor.execute(
            f"""
            SELECT stm.task_id, am.model_code
            FROM scheduled_task_model stm
            INNER JOIN ai_model am ON am.id = stm.model_id
            WHERE stm.task_id IN ({placeholders})
            ORDER BY stm.task_id ASC, stm.sort_order ASC, am.model_code ASC
            """,
            tuple(task_ids),
        )
        result: dict[int, list[str]] = {}
        for row in cursor.fetchall():
            result.setdefault(int(row["task_id"]), []).append(str(row["model_code"]))
        return result

    @staticmethod
    def _load_task_weekdays(cursor, task_ids: list[int]) -> dict[int, list[int]]:
        if not task_ids:
            return {}
        placeholders = ", ".join("?" for _ in task_ids)
        cursor.execute(
            f"""
            SELECT task_id, weekday
            FROM scheduled_task_weekday
            WHERE task_id IN ({placeholders})
            ORDER BY task_id ASC, weekday ASC
            """,
            tuple(task_ids),
        )
        result: dict[int, list[int]] = {}
        for row in cursor.fetchall():
            result.setdefault(int(row["task_id"]), []).append(int(row["weekday"]))
        return result
