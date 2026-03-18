#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from backend.app.config import load_settings
from backend.app.db.connection import ensure_schema, get_connection
from backend.app.db.lottery_tables import LOTTERY_SCOPED_TABLES
from backend.app.logging_utils import get_logger
from backend.app.lotteries import SUPPORTED_LOTTERY_CODES, normalize_lottery_code
from backend.scripts.mysql_backup import backup_mysql_database


logger = get_logger("scripts.drop_legacy_lottery_tables")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Drop legacy shared lottery tables after split-table migration.")
    parser.add_argument(
        "--lottery-codes",
        default=",".join(SUPPORTED_LOTTERY_CODES),
        help=f"Comma-separated lottery codes, default: {','.join(SUPPORTED_LOTTERY_CODES)}",
    )
    parser.add_argument("--dry-run", action="store_true", help="Only print tables that would be dropped")
    parser.add_argument("--skip-backup", action="store_true", help="Skip MySQL backup before dropping tables")
    parser.add_argument("--backup-dir", default=None, help="Backup output directory")
    return parser.parse_args()


def parse_lottery_codes(raw_codes: str) -> list[str]:
    normalized_codes: list[str] = []
    for item in (part.strip() for part in str(raw_codes).split(",")):
        if not item:
            continue
        code = normalize_lottery_code(item)
        if code not in normalized_codes:
            normalized_codes.append(code)
    if not normalized_codes:
        raise ValueError("lottery_codes 不能为空")
    return normalized_codes


def fetch_existing_tables(cursor, *, database_name: str, table_names: list[str] | tuple[str, ...]) -> set[str]:
    if not table_names:
        return set()
    placeholders = ", ".join("?" for _ in table_names)
    cursor.execute(
        f"""
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ({placeholders})
        """,
        (database_name, *table_names),
    )
    return {str(row["TABLE_NAME"]) for row in cursor.fetchall()}


def required_split_tables(lottery_codes: list[str]) -> list[str]:
    return [f"{lottery_code}_{table_name}" for lottery_code in lottery_codes for table_name in LOTTERY_SCOPED_TABLES]


def drop_tables(cursor, table_names: list[str]) -> None:
    cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
    try:
        for table_name in table_names:
            cursor.execute(f"DROP TABLE IF EXISTS `{table_name}`")
    finally:
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")


def main() -> None:
    args = parse_args()
    lottery_codes = parse_lottery_codes(args.lottery_codes)
    backup_path = None
    if not args.skip_backup:
        backup_path = backup_mysql_database(
            output_dir=Path(args.backup_dir) if args.backup_dir else None,
            file_prefix="pre_drop_legacy_shared_tables",
        )
        logger.info("Database backup completed", extra={"context": {"backup_file": str(backup_path)}})

    ensure_schema()
    database_name = load_settings().mysql_database
    summary: dict[str, Any] = {
        "lottery_codes": lottery_codes,
        "backup_file": str(backup_path) if backup_path else None,
        "dropped_tables": [],
        "dry_run": bool(args.dry_run),
    }

    with get_connection() as connection:
        with connection.cursor() as cursor:
            required_tables = required_split_tables(lottery_codes)
            existing_split_tables = fetch_existing_tables(cursor, database_name=database_name, table_names=required_tables)
            missing_split_tables = sorted(set(required_tables) - existing_split_tables)
            if missing_split_tables:
                raise RuntimeError(
                    "Split tables missing, aborting cleanup: " + ", ".join(missing_split_tables)
                )

            legacy_tables = sorted(
                fetch_existing_tables(cursor, database_name=database_name, table_names=LOTTERY_SCOPED_TABLES)
            )
            summary["legacy_tables_found"] = legacy_tables
            if args.dry_run or not legacy_tables:
                print(json.dumps(summary, ensure_ascii=False))
                return

            drop_tables(cursor, legacy_tables)
            summary["dropped_tables"] = legacy_tables

    logger.info(
        "Legacy shared lottery tables dropped",
        extra={"context": {"table_count": len(summary["dropped_tables"]), "tables": summary["dropped_tables"]}},
    )
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
