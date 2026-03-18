#!/usr/bin/env python3

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from backend.app.config import load_settings
from backend.app.db.connection import ensure_schema, get_connection
from backend.app.logging_utils import get_logger
from backend.app.lotteries import SUPPORTED_LOTTERY_CODES, normalize_lottery_code
from backend.scripts.mysql_backup import backup_mysql_database


logger = get_logger("scripts.migrate_lottery_split_tables")


@dataclass(frozen=True)
class CopyRule:
    table_name: str
    from_sql: str
    where_sql: str


MIGRATION_RULES: tuple[CopyRule, ...] = (
    CopyRule("draw_issue", "draw_issue src", "src.lottery_code = ?"),
    CopyRule(
        "draw_result",
        "draw_result src INNER JOIN draw_issue di ON di.id = src.issue_id",
        "di.lottery_code = ?",
    ),
    CopyRule(
        "draw_result_number",
        "draw_result_number src "
        "INNER JOIN draw_result dr ON dr.id = src.draw_result_id "
        "INNER JOIN draw_issue di ON di.id = dr.issue_id",
        "di.lottery_code = ?",
    ),
    CopyRule(
        "draw_result_prize",
        "draw_result_prize src "
        "INNER JOIN draw_result dr ON dr.id = src.draw_result_id "
        "INNER JOIN draw_issue di ON di.id = dr.issue_id",
        "di.lottery_code = ?",
    ),
    CopyRule("prediction_batch", "prediction_batch src", "src.lottery_code = ?"),
    CopyRule(
        "prediction_model_run",
        "prediction_model_run src "
        "INNER JOIN prediction_batch pb ON pb.id = src.prediction_batch_id",
        "pb.lottery_code = ?",
    ),
    CopyRule(
        "prediction_group",
        "prediction_group src "
        "INNER JOIN prediction_model_run pmr ON pmr.id = src.model_run_id "
        "INNER JOIN prediction_batch pb ON pb.id = pmr.prediction_batch_id",
        "pb.lottery_code = ?",
    ),
    CopyRule(
        "prediction_group_number",
        "prediction_group_number src "
        "INNER JOIN prediction_group pg ON pg.id = src.prediction_group_id "
        "INNER JOIN prediction_model_run pmr ON pmr.id = pg.model_run_id "
        "INNER JOIN prediction_batch pb ON pb.id = pmr.prediction_batch_id",
        "pb.lottery_code = ?",
    ),
    CopyRule(
        "prediction_hit_summary",
        "prediction_hit_summary src "
        "INNER JOIN prediction_group pg ON pg.id = src.prediction_group_id "
        "INNER JOIN prediction_model_run pmr ON pmr.id = pg.model_run_id "
        "INNER JOIN prediction_batch pb ON pb.id = pmr.prediction_batch_id",
        "pb.lottery_code = ?",
    ),
    CopyRule(
        "prediction_hit_number",
        "prediction_hit_number src "
        "INNER JOIN prediction_hit_summary phs ON phs.id = src.hit_summary_id "
        "INNER JOIN prediction_group pg ON pg.id = phs.prediction_group_id "
        "INNER JOIN prediction_model_run pmr ON pmr.id = pg.model_run_id "
        "INNER JOIN prediction_batch pb ON pb.id = pmr.prediction_batch_id",
        "pb.lottery_code = ?",
    ),
    CopyRule(
        "model_batch_summary",
        "model_batch_summary src "
        "INNER JOIN prediction_model_run pmr ON pmr.id = src.model_run_id "
        "INNER JOIN prediction_batch pb ON pb.id = pmr.prediction_batch_id",
        "pb.lottery_code = ?",
    ),
    CopyRule("simulation_ticket", "simulation_ticket src", "src.lottery_code = ?"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Copy shared lottery data tables into per-lottery split tables.")
    parser.add_argument(
        "--lottery-codes",
        default=",".join(SUPPORTED_LOTTERY_CODES),
        help=f"Comma-separated lottery codes, default: {','.join(SUPPORTED_LOTTERY_CODES)}",
    )
    parser.add_argument("--skip-backup", action="store_true", help="Skip mysqldump backup")
    parser.add_argument("--backup-dir", default=None, help="Backup output directory")
    parser.add_argument("--truncate-target", action="store_true", help="Truncate split tables before copying")
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


def fetch_table_columns(cursor, *, database_name: str, table_name: str) -> list[str]:
    cursor.execute(
        """
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION ASC
        """,
        (database_name, table_name),
    )
    columns = [str(row["COLUMN_NAME"]) for row in cursor.fetchall()]
    if not columns:
        raise RuntimeError(f"table not found: {table_name}")
    return columns


def truncate_split_tables(cursor, lottery_code: str) -> None:
    cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
    try:
        for rule in reversed(MIGRATION_RULES):
            cursor.execute(f"TRUNCATE TABLE {lottery_code}_{rule.table_name}")
    finally:
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")


def copy_table_rows(cursor, *, database_name: str, lottery_code: str, rule: CopyRule) -> int:
    target_table = f"{lottery_code}_{rule.table_name}"
    columns = fetch_table_columns(cursor, database_name=database_name, table_name=rule.table_name)
    column_sql = ", ".join(f"`{column}`" for column in columns)
    select_sql = ", ".join(f"src.`{column}`" for column in columns)
    cursor.execute(
        f"""
        INSERT IGNORE INTO {target_table} ({column_sql})
        SELECT {select_sql}
        FROM {rule.from_sql}
        WHERE {rule.where_sql}
        """,
        (lottery_code,),
    )
    return int(cursor.rowcount or 0)


def main() -> None:
    args = parse_args()
    lottery_codes = parse_lottery_codes(args.lottery_codes)
    backup_path = None
    if not args.skip_backup:
        backup_path = backup_mysql_database(
            output_dir=Path(args.backup_dir) if args.backup_dir else None,
            file_prefix="pre_split_backup",
        )
        logger.info("Database backup completed", extra={"context": {"backup_file": str(backup_path)}})

    ensure_schema()
    database_name = load_settings().mysql_database
    migration_summary: dict[str, dict[str, int]] = {}
    with get_connection() as connection:
        with connection.cursor() as cursor:
            for lottery_code in lottery_codes:
                if args.truncate_target:
                    truncate_split_tables(cursor, lottery_code)
                table_insertions: dict[str, int] = {}
                for rule in MIGRATION_RULES:
                    inserted_count = copy_table_rows(
                        cursor,
                        database_name=database_name,
                        lottery_code=lottery_code,
                        rule=rule,
                    )
                    table_insertions[rule.table_name] = inserted_count
                    logger.info(
                        "Split table rows copied",
                        extra={
                            "context": {
                                "lottery_code": lottery_code,
                                "source_table": rule.table_name,
                                "target_table": f"{lottery_code}_{rule.table_name}",
                                "inserted_count": inserted_count,
                            }
                        },
                    )
                migration_summary[lottery_code] = table_insertions

    logger.info(
        "Split table migration completed",
        extra={"context": {"lottery_codes": lottery_codes, "backup_file": str(backup_path) if backup_path else None}},
    )
    print(migration_summary)


if __name__ == "__main__":
    main()
