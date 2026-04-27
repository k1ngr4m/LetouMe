from __future__ import annotations

import argparse
from typing import Any

from backend.app.db.connection import ensure_schema, get_connection
from backend.app.time_utils import ensure_timestamp


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
    parser = argparse.ArgumentParser(description="Normalize ai_model.updated_at to second-level timestamps.")
    parser.add_argument("--apply", action="store_true", help="Apply changes. Default is dry-run.")
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
                SELECT data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = ?
                  AND table_name = 'ai_model'
                  AND column_name = 'updated_at'
                """,
                (db_name,),
            )
            column = cursor.fetchone() or {}
            data_type = str(_row_value(column, "data_type") or "").lower()
            cursor.execute("SELECT id, model_code, updated_at FROM ai_model ORDER BY id ASC")
            rows = cursor.fetchall()

        normalized_rows = [
            {
                "id": int(row["id"]),
                "model_code": str(row.get("model_code") or ""),
                "old_value": row.get("updated_at"),
                "new_value": normalize_updated_at(row.get("updated_at")),
            }
            for row in rows
        ]
        changed_rows = [row for row in normalized_rows if str(row["old_value"]) != str(row["new_value"])]
        print(
            f"ai_model.updated_at type={data_type or 'unknown'} rows={len(rows)} "
            f"changed={len(changed_rows)} apply={bool(args.apply)}"
        )
        for row in changed_rows[:20]:
            print(f"- {row['model_code']}: {row['old_value']} -> {row['new_value']}")
        if len(changed_rows) > 20:
            print(f"... {len(changed_rows) - 20} more")
        if not args.apply:
            return

        with connection.cursor() as cursor:
            if data_type not in {"bigint", "int"}:
                cursor.execute("ALTER TABLE ai_model MODIFY COLUMN updated_at BIGINT NOT NULL DEFAULT 0")
            for row in normalized_rows:
                cursor.execute(
                    "UPDATE ai_model SET updated_at = ? WHERE id = ?",
                    (row["new_value"], row["id"]),
                )


def normalize_updated_at(value: Any) -> int:
    return int(ensure_timestamp(value, assume_beijing=True) or 0)


if __name__ == "__main__":
    main()
