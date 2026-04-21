from __future__ import annotations

import json
from typing import Any

from backend.app.db.connection import get_connection
from backend.app.time_utils import ensure_timestamp


class SmartPredictionRepository:
    def create_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO smart_prediction_run (
                        run_id,
                        lottery_code,
                        target_period,
                        created_by_user_id,
                        status,
                        stage1_task_id,
                        stage2_task_id,
                        stage1_status,
                        stage2_status,
                        stage1_model_code,
                        stage2_model_code,
                        history_period_count,
                        data_model_codes_json,
                        strategy_codes_json,
                        options_json,
                        warnings_json,
                        stage1_result_json,
                        stage2_result_json,
                        error_message
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(payload.get("run_id") or "").strip(),
                        str(payload.get("lottery_code") or "dlt").strip(),
                        str(payload.get("target_period") or "").strip(),
                        int(payload.get("created_by_user_id") or 0),
                        str(payload.get("status") or "queued").strip(),
                        self._optional_str(payload.get("stage1_task_id")),
                        self._optional_str(payload.get("stage2_task_id")),
                        str(payload.get("stage1_status") or "queued").strip(),
                        str(payload.get("stage2_status") or "idle").strip(),
                        str(payload.get("stage1_model_code") or "").strip(),
                        str(payload.get("stage2_model_code") or "").strip(),
                        int(payload.get("history_period_count") or 50),
                        self._dump_json(payload.get("data_model_codes") or []),
                        self._dump_json(payload.get("strategy_codes") or []),
                        self._dump_json(payload.get("options") or {}),
                        self._dump_json(payload.get("warnings") or []),
                        self._dump_json(payload.get("stage1_result")),
                        self._dump_json(payload.get("stage2_result")),
                        self._optional_str(payload.get("error_message")),
                    ),
                )
        return self.get_run(str(payload.get("run_id") or "").strip()) or {}

    def update_run(self, run_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        field_map = {
            "lottery_code": lambda value: str(value or "dlt").strip(),
            "target_period": lambda value: str(value or "").strip(),
            "status": lambda value: str(value or "").strip(),
            "stage1_task_id": self._optional_str,
            "stage2_task_id": self._optional_str,
            "stage1_status": lambda value: str(value or "").strip(),
            "stage2_status": lambda value: str(value or "").strip(),
            "stage1_model_code": lambda value: str(value or "").strip(),
            "stage2_model_code": lambda value: str(value or "").strip(),
            "history_period_count": lambda value: int(value or 50),
            "data_model_codes": self._dump_json,
            "strategy_codes": self._dump_json,
            "options": self._dump_json,
            "warnings": self._dump_json,
            "stage1_result": self._dump_json,
            "stage2_result": self._dump_json,
            "error_message": self._optional_str,
        }
        assignments: list[str] = []
        params: list[Any] = []
        for key, formatter in field_map.items():
            if key not in updates:
                continue
            column_name = f"{key}_json" if key in {"data_model_codes", "strategy_codes", "options", "warnings", "stage1_result", "stage2_result"} else key
            assignments.append(f"{column_name} = ?")
            params.append(formatter(updates.get(key)))
        if not assignments:
            return self.get_run(run_id) or {}
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE smart_prediction_run
                    SET {", ".join(assignments)},
                        updated_at = CURRENT_TIMESTAMP
                    WHERE run_id = ?
                    """,
                    tuple(params + [run_id]),
                )
                if cursor.rowcount == 0:
                    existing = self.get_run(run_id)
                    if not existing:
                        raise KeyError(run_id)
                    return existing
        return self.get_run(run_id) or {}

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM smart_prediction_run WHERE run_id = ? LIMIT 1", (run_id,))
                row = cursor.fetchone()
        return self._serialize(row) if row else None

    def list_runs(self, *, limit: int = 20, offset: int = 0) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) AS total_count FROM smart_prediction_run")
                total_count = int((cursor.fetchone() or {}).get("total_count") or 0)
                cursor.execute(
                    """
                    SELECT *
                    FROM smart_prediction_run
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    OFFSET ?
                    """,
                    (max(1, int(limit)), max(0, int(offset))),
                )
                rows = cursor.fetchall()
        return {
            "runs": [self._serialize(row) for row in rows],
            "total_count": total_count,
        }

    @staticmethod
    def _dump_json(value: Any) -> str:
        if value is None:
            return "null"
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def _load_json(value: Any, fallback: Any) -> Any:
        if value is None or str(value).strip() == "":
            return fallback
        try:
            return json.loads(str(value))
        except Exception:
            return fallback

    @staticmethod
    def _optional_str(value: Any) -> str | None:
        normalized = str(value or "").strip()
        return normalized or None

    def _serialize(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "run_id": str(row.get("run_id") or ""),
            "lottery_code": str(row.get("lottery_code") or "dlt"),
            "target_period": str(row.get("target_period") or ""),
            "created_by_user_id": int(row.get("created_by_user_id") or 0),
            "status": str(row.get("status") or "queued"),
            "stage1_task_id": self._optional_str(row.get("stage1_task_id")),
            "stage2_task_id": self._optional_str(row.get("stage2_task_id")),
            "stage1_status": str(row.get("stage1_status") or "queued"),
            "stage2_status": str(row.get("stage2_status") or "idle"),
            "stage1_model_code": str(row.get("stage1_model_code") or ""),
            "stage2_model_code": str(row.get("stage2_model_code") or ""),
            "history_period_count": int(row.get("history_period_count") or 50),
            "data_model_codes": self._load_json(row.get("data_model_codes_json"), []),
            "strategy_codes": self._load_json(row.get("strategy_codes_json"), []),
            "options": self._load_json(row.get("options_json"), {}),
            "warnings": self._load_json(row.get("warnings_json"), []),
            "stage1_result": self._load_json(row.get("stage1_result_json"), None),
            "stage2_result": self._load_json(row.get("stage2_result_json"), None),
            "error_message": self._optional_str(row.get("error_message")),
            "created_at": ensure_timestamp(row.get("created_at")),
            "updated_at": ensure_timestamp(row.get("updated_at")),
        }
