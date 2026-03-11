from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pymysql
from pymysql.cursors import DictCursor

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.config import load_settings
from app.db.connection import ensure_schema, get_connection
from app.repositories.prediction_repository import PredictionRepository
from app.services.lottery_service import LotteryService


MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_RESTORE_HOST", "49.235.23.27"),
    "port": int(os.getenv("MYSQL_RESTORE_PORT", "3306")),
    "user": os.getenv("MYSQL_RESTORE_USER", "root"),
    "password": os.getenv("MYSQL_RESTORE_PASSWORD", "OpenClaw2026!"),
    "database": os.getenv("MYSQL_RESTORE_DATABASE", "letoume"),
    "charset": "utf8mb4",
    "ssl_disabled": True,
    "cursorclass": DictCursor,
}

RESET_TABLES = [
    "write_log_detail",
    "write_log",
    "prediction_hit_number",
    "prediction_hit_summary",
    "model_batch_summary",
    "prediction_group_number",
    "prediction_group",
    "prediction_model_run",
    "prediction_batch",
    "ai_model_tag",
    "model_tag",
    "ai_model",
    "model_provider",
    "draw_result_number",
    "draw_result",
    "draw_issue",
]


def _decode_payload(value: Any) -> dict[str, Any]:
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str):
        return json.loads(value)
    return dict(value or {})


def _sanitize_draw(row: dict[str, Any]) -> dict[str, Any]:
    red_raw = row.get("red_balls") or []
    blue_raw = row.get("blue_balls") or row.get("blue_ball") or []
    if isinstance(red_raw, str):
        try:
            red_balls = list(json.loads(red_raw))
        except json.JSONDecodeError:
            red_balls = [red_raw]
    else:
        red_balls = list(red_raw)
    if isinstance(blue_raw, str):
        try:
            blue_balls = list(json.loads(blue_raw))
        except json.JSONDecodeError:
            blue_balls = [blue_raw]
    else:
        blue_balls = list(blue_raw)
    draw_date = row.get("draw_date")
    if hasattr(draw_date, "isoformat"):
        draw_date = draw_date.isoformat()
    return {
        "period": str(row.get("period") or ""),
        "red_balls": red_balls,
        "blue_balls": blue_balls,
        "date": draw_date or "",
    }


def _backup_sqlite(db_path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = db_path.with_name(f"{db_path.stem}.backup-{timestamp}{db_path.suffix}")
    if db_path.exists():
        shutil.copy2(db_path, backup_path)
    return backup_path


def _reset_sqlite(db_path: Path) -> None:
    if db_path.exists():
        db_path.unlink()
    ensure_schema()


def _fetch_mysql_rows(connection, table_name: str) -> list[dict[str, Any]]:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT * FROM {table_name}")
        return list(cursor.fetchall())


def _restore_write_logs(mysql_logs: list[dict[str, Any]]) -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            for row in mysql_logs:
                target_key = str(row.get("target_key") or "")
                entity_id = target_key.split("=", 1)[1] if "=" in target_key else None
                created_at = row.get("created_at")
                if hasattr(created_at, "strftime"):
                    created_at = created_at.strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute(
                    """
                    INSERT INTO write_log (
                        entity_type,
                        entity_id,
                        table_name,
                        action,
                        target_key,
                        status,
                        summary,
                        error_message,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(row.get("table_name") or ""),
                        entity_id,
                        str(row.get("table_name") or ""),
                        str(row.get("action") or ""),
                        target_key,
                        str(row.get("status") or ""),
                        str(row.get("summary") or ""),
                        row.get("error_message"),
                        created_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    ),
                )
                log_id = cursor.lastrowid
                payload = row.get("payload_json")
                if payload:
                    payload_dict = _decode_payload(payload)
                    for field_name, value in payload_dict.items():
                        if isinstance(value, (dict, list, tuple, set)):
                            continue
                        cursor.execute(
                            """
                            INSERT INTO write_log_detail (log_id, field_name, new_value_text)
                            VALUES (?, ?, ?)
                            """,
                            (log_id, str(field_name), None if value is None else str(value)),
                        )


def main() -> None:
    settings = load_settings()
    sqlite_path = settings.database_path
    backup_path = _backup_sqlite(sqlite_path)

    print(f"SQLite backup: {backup_path}")
    print("Connecting to MySQL source...")

    mysql_connection = pymysql.connect(**MYSQL_CONFIG)
    try:
        mysql_lottery_rows = _fetch_mysql_rows(mysql_connection, "lottery_draws")
        mysql_current_rows = _fetch_mysql_rows(mysql_connection, "current_predictions")
        mysql_history_rows = _fetch_mysql_rows(mysql_connection, "prediction_history")
        mysql_log_rows = _fetch_mysql_rows(mysql_connection, "data_write_logs")
    finally:
        mysql_connection.close()

    print(
        "MySQL source counts:",
        {
            "lottery_draws": len(mysql_lottery_rows),
            "current_predictions": len(mysql_current_rows),
            "prediction_history": len(mysql_history_rows),
            "data_write_logs": len(mysql_log_rows),
        },
    )

    _reset_sqlite(sqlite_path)

    lottery_service = LotteryService()
    prediction_repository = PredictionRepository()

    print("Restoring lottery draws...")
    lottery_service.save_draws([_sanitize_draw(row) for row in mysql_lottery_rows])

    print("Restoring current predictions...")
    for row in mysql_current_rows:
        prediction_repository.replace_current_prediction(_decode_payload(row.get("payload_json")))

    print("Restoring prediction history...")
    mysql_history_rows.sort(key=lambda row: str(row.get("target_period") or ""))
    for row in mysql_history_rows:
        prediction_repository.upsert_history_record(_decode_payload(row.get("payload_json")))

    print("Restoring structured write logs...")
    _restore_write_logs(mysql_log_rows)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            counts: dict[str, int] = {}
            for table_name in [
                "draw_issue",
                "draw_result",
                "prediction_batch",
                "prediction_model_run",
                "prediction_group",
                "prediction_hit_summary",
                "write_log",
            ]:
                cursor.execute(f"SELECT COUNT(*) AS total FROM {table_name}")
                counts[table_name] = int(cursor.fetchone()["total"])

    print("SQLite restored counts:", counts)
    print("Restore completed successfully.")


if __name__ == "__main__":
    main()
