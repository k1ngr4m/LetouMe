from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from backend.app.config import load_settings
from backend.app.db.connection import ensure_schema, get_connection
from backend.app.logging_utils import get_logger


TABLE_ORDER = [
    "draw_issue",
    "draw_result",
    "draw_result_number",
    "model_provider",
    "ai_model",
    "model_tag",
    "ai_model_tag",
    "prediction_batch",
    "prediction_model_run",
    "prediction_group",
    "prediction_group_number",
    "prediction_hit_summary",
    "prediction_hit_number",
    "model_batch_summary",
    "write_log",
    "write_log_detail",
]
logger = get_logger("scripts.sqlite_migration")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate LetouMe data from SQLite to MySQL.")
    parser.add_argument(
        "--sqlite-path",
        dest="sqlite_path",
        default=None,
        help="Override SQLITE_PATH from environment.",
    )
    return parser.parse_args()


def _open_sqlite_connection(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def _assert_target_is_empty() -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            for table_name in TABLE_ORDER:
                cursor.execute(f"SELECT COUNT(*) AS total FROM {table_name}")
                total = int((cursor.fetchone() or {}).get("total") or 0)
                if total:
                    raise RuntimeError(f"MySQL target table is not empty: {table_name}")


def _copy_table(sqlite_connection: sqlite3.Connection, table_name: str) -> int:
    sqlite_rows = sqlite_connection.execute(f"SELECT * FROM {table_name}").fetchall()
    if not sqlite_rows:
        return 0

    columns = list(sqlite_rows[0].keys())
    column_sql = ", ".join(f"`{column}`" for column in columns)
    values_sql = ", ".join(["%s"] * len(columns))
    insert_sql = f"INSERT INTO {table_name} ({column_sql}) VALUES ({values_sql})"
    rows = [tuple(row[column] for column in columns) for row in sqlite_rows]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
            cursor.executemany(insert_sql, rows)
            cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
    return len(rows)


def main() -> None:
    args = _parse_args()
    settings = load_settings()
    sqlite_path = Path(args.sqlite_path) if args.sqlite_path else settings.sqlite_source_path
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite source not found: {sqlite_path}")

    ensure_schema()
    _assert_target_is_empty()

    sqlite_connection = _open_sqlite_connection(sqlite_path)
    try:
        for table_name in TABLE_ORDER:
            copied = _copy_table(sqlite_connection, table_name)
            logger.info("Copied SQLite rows", extra={"context": {"table_name": table_name, "row_count": copied}})
    finally:
        sqlite_connection.close()

    logger.info("SQLite to MySQL migration completed", extra={"context": {"sqlite_path": sqlite_path}})


if __name__ == "__main__":
    main()
