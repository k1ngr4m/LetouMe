from __future__ import annotations

from typing import Any

from backend.app.db.connection import get_connection
from backend.app.time_utils import ensure_timestamp, now_ts


class MaintenanceRunLogRepository:
    def create_log(
        self,
        *,
        task_id: str,
        lottery_code: str,
        trigger_type: str,
        task_type: str = "lottery_fetch",
        mode: str | None = None,
        model_code: str | None = None,
        status: str,
        created_at: int | None = None,
    ) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO maintenance_run_log (
                        task_id,
                        lottery_code,
                        trigger_type,
                        task_type,
                        mode,
                        model_code,
                        status,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, ?))
                    ON DUPLICATE KEY UPDATE
                        lottery_code = VALUES(lottery_code),
                        trigger_type = VALUES(trigger_type),
                        task_type = VALUES(task_type),
                        mode = VALUES(mode),
                        model_code = VALUES(model_code),
                        status = VALUES(status),
                        updated_at = VALUES(created_at)
                    """,
                    (task_id, lottery_code, trigger_type, task_type, mode, model_code, status, ensure_timestamp(created_at), now_ts()),
                )
        return {
            "task_id": task_id,
            "lottery_code": lottery_code,
            "trigger_type": trigger_type,
            "task_type": task_type,
            "mode": mode,
            "model_code": model_code,
            "status": status,
            "created_at": created_at,
        }

    def update_by_task_id(self, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        fields = {
            "status": payload.get("status"),
            "task_type": str(payload.get("task_type") or "lottery_fetch"),
            "mode": payload.get("mode"),
            "model_code": payload.get("model_code"),
            "started_at": ensure_timestamp(payload.get("started_at")),
            "finished_at": ensure_timestamp(payload.get("finished_at")),
            "fetched_count": int(payload.get("fetched_count") or 0),
            "saved_count": int(payload.get("saved_count") or 0),
            "processed_count": int(payload.get("processed_count") or 0),
            "skipped_count": int(payload.get("skipped_count") or 0),
            "failed_count": int(payload.get("failed_count") or 0),
            "latest_period": payload.get("latest_period"),
            "duration_ms": float(payload.get("duration_ms") or 0),
            "error_message": payload.get("error_message"),
        }
        assignments = ", ".join(f"{column} = ?" for column in fields)
        params = tuple(fields.values()) + (now_ts(), task_id)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE maintenance_run_log
                    SET {assignments},
                        updated_at = ?
                    WHERE task_id = ?
                    """,
                    params,
                )
                if cursor.rowcount == 0:
                    cursor.execute("SELECT 1 FROM maintenance_run_log WHERE task_id = ? LIMIT 1", (task_id,))
                    if cursor.fetchone() is None:
                        raise KeyError(task_id)
        return {
            "task_id": task_id,
            **fields,
        }

    def get_by_task_id(self, task_id: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM maintenance_run_log WHERE task_id = ?", (task_id,))
                row = cursor.fetchone()
        return self._serialize(row) if row else None

    def list_logs(
        self,
        *,
        lottery_code: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, Any]:
        conditions = []
        params: list[Any] = []
        if lottery_code:
            conditions.append("lottery_code = ?")
            params.append(lottery_code)
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT COUNT(*) AS total_count
                    FROM maintenance_run_log
                    {where_clause}
                    """,
                    tuple(params),
                )
                total_count = int((cursor.fetchone() or {}).get("total_count") or 0)

                cursor.execute(
                    f"""
                    SELECT *
                    FROM maintenance_run_log
                    {where_clause}
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    OFFSET ?
                    """,
                    tuple(params + [limit, offset]),
                )
                logs = [self._serialize(row) for row in cursor.fetchall()]
        return {"logs": logs, "total_count": total_count}

    def _serialize(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": int(row["id"]),
            "task_id": str(row["task_id"]),
            "lottery_code": str(row.get("lottery_code") or "dlt"),
            "trigger_type": str(row.get("trigger_type") or "manual"),
            "task_type": str(row.get("task_type") or "lottery_fetch"),
            "mode": str(row["mode"]) if row.get("mode") else None,
            "model_code": str(row["model_code"]) if row.get("model_code") else None,
            "status": str(row.get("status") or "queued"),
            "started_at": ensure_timestamp(row.get("started_at")),
            "finished_at": ensure_timestamp(row.get("finished_at")),
            "fetched_count": int(row.get("fetched_count") or 0),
            "saved_count": int(row.get("saved_count") or 0),
            "processed_count": int(row.get("processed_count") or 0),
            "skipped_count": int(row.get("skipped_count") or 0),
            "failed_count": int(row.get("failed_count") or 0),
            "latest_period": str(row["latest_period"]) if row.get("latest_period") else None,
            "duration_ms": float(row.get("duration_ms") or 0),
            "error_message": str(row["error_message"]) if row.get("error_message") else None,
            "created_at": ensure_timestamp(row.get("created_at")),
            "updated_at": ensure_timestamp(row.get("updated_at")),
        }
