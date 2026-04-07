from __future__ import annotations

import argparse
from collections import defaultdict
from typing import Any

from backend.app.db.connection import ensure_schema, get_connection
from backend.app.logging_utils import get_logger
from backend.app.time_utils import ensure_timestamp


logger = get_logger("scripts.migrate_beijing_timestamps")

BEIJING_ASSUMED_COLUMNS = {"ocr_recognized_at", "ticket_purchased_at"}


def _row_value(row: dict[str, Any], key: str) -> Any:
    if key in row:
        return row[key]
    upper_key = key.upper()
    if upper_key in row:
        return row[upper_key]
    lower_key = key.lower()
    if lower_key in row:
        return row[lower_key]
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert legacy DB time columns to second-level timestamps.")
    parser.add_argument("--apply", action="store_true", help="Run DDL/DML updates. Default is dry-run.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ensure_schema()
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT DATABASE() AS db_name")
            db_name = str(_row_value(cursor.fetchone() or {}, "db_name") or "")
            cursor.execute(
                """
                SELECT table_name, column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = ?
                  AND (
                    column_name REGEXP '_at$'
                    OR column_name IN ('expires_at', 'last_seen_at', 'read_at', 'deleted_at')
                  )
                ORDER BY table_name, ordinal_position
                """,
                (db_name,),
            )
            columns = cursor.fetchall()
            pk_map = _load_primary_keys(cursor, db_name)

        table_columns: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in columns:
            table_columns[str(_row_value(row, "table_name"))].append(row)

        for table_name, time_columns in table_columns.items():
            pk_columns = pk_map.get(table_name) or []
            if not pk_columns:
                logger.warning("Skip table without primary key", extra={"context": {"table_name": table_name}})
                continue
            _migrate_table(connection, table_name, pk_columns, time_columns, apply_changes=bool(args.apply))


def _load_primary_keys(cursor: Any, db_name: str) -> dict[str, list[str]]:
    cursor.execute(
        """
        SELECT table_name, column_name
        FROM information_schema.key_column_usage
        WHERE table_schema = ?
          AND constraint_name = 'PRIMARY'
        ORDER BY table_name, ordinal_position
        """,
        (db_name,),
    )
    grouped: dict[str, list[str]] = defaultdict(list)
    for row in cursor.fetchall():
        grouped[str(_row_value(row, "table_name"))].append(str(_row_value(row, "column_name")))
    return grouped


def _migrate_table(connection: Any, table_name: str, pk_columns: list[str], time_columns: list[dict[str, Any]], *, apply_changes: bool) -> None:
    select_columns = pk_columns + [str(_row_value(item, "column_name")) for item in time_columns]
    select_sql = f"SELECT {', '.join(f'`{column}`' for column in select_columns)} FROM `{table_name}`"
    with connection.cursor() as cursor:
        cursor.execute(select_sql)
        rows = cursor.fetchall()
    logger.info(
        "Prepared timestamp migration",
        extra={
            "context": {
                "table_name": table_name,
                "row_count": len(rows),
                "columns": [str(_row_value(item, "column_name")) for item in time_columns],
                "apply": apply_changes,
            }
        },
    )
    if not apply_changes:
        return

    for column in time_columns:
        column_name = str(_row_value(column, "column_name"))
        data_type = str(_row_value(column, "data_type")).lower()
        is_nullable = str(_row_value(column, "is_nullable")).upper() == "YES"
        if data_type not in {"bigint", "int"}:
            null_sql = "NULL" if is_nullable else "NOT NULL DEFAULT 0"
            with connection.cursor() as cursor:
                cursor.execute(f"ALTER TABLE `{table_name}` MODIFY COLUMN `{column_name}` BIGINT {null_sql}")

    where_clause = " AND ".join(f"`{column}` = ?" for column in pk_columns)
    for row in rows:
        pk_values = tuple(row[column] for column in pk_columns)
        updates: dict[str, int | None] = {}
        for column in time_columns:
            column_name = str(_row_value(column, "column_name"))
            updates[column_name] = ensure_timestamp(
                row.get(column_name),
                assume_beijing=column_name in BEIJING_ASSUMED_COLUMNS,
            )
        assignment_sql = ", ".join(f"`{column}` = ?" for column in updates)
        params = tuple(updates[column] for column in updates) + pk_values
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE `{table_name}` SET {assignment_sql} WHERE {where_clause}",
                params,
            )


if __name__ == "__main__":
    main()
