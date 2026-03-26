from __future__ import annotations

import argparse
from typing import Any

from backend.app.config import load_settings
from backend.app.db.connection import get_connection
from backend.app.lotteries import SUPPORTED_LOTTERY_CODES
from backend.app.logging_utils import get_logger
from backend.scripts.mysql_backup import backup_mysql_database


logger = get_logger("scripts.cleanup_phase5_legacy_schema")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Drop phase-5 legacy columns from the dev schema after compatibility backfill.")
    parser.add_argument("--allow-non-dev", action="store_true", help="Allow running against databases other than letoume_dev.")
    parser.add_argument("--skip-backup", action="store_true", help="Skip backup before cleanup.")
    return parser.parse_args()


def _table_exists(cursor, table_name: str) -> bool:
    settings = load_settings()
    cursor.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = ? AND table_name = ?
        LIMIT 1
        """,
        (settings.mysql_database, table_name),
    )
    return cursor.fetchone() is not None


def _has_column(cursor, table_name: str, column_name: str) -> bool:
    settings = load_settings()
    cursor.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ? AND column_name = ?
        LIMIT 1
        """,
        (settings.mysql_database, table_name, column_name),
    )
    return cursor.fetchone() is not None


def _has_index(cursor, table_name: str, index_name: str) -> bool:
    settings = load_settings()
    cursor.execute(
        """
        SELECT 1
        FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = ? AND index_name = ?
        LIMIT 1
        """,
        (settings.mysql_database, table_name, index_name),
    )
    return cursor.fetchone() is not None


def _has_foreign_key(cursor, table_name: str, constraint_name: str) -> bool:
    settings = load_settings()
    cursor.execute(
        """
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = ? AND table_name = ? AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'
        LIMIT 1
        """,
        (settings.mysql_database, table_name, constraint_name),
    )
    return cursor.fetchone() is not None


def _drop_index_if_exists(cursor, table_name: str, index_name: str) -> None:
    if _has_index(cursor, table_name, index_name):
        cursor.execute(f"ALTER TABLE `{table_name}` DROP INDEX `{index_name}`")


def _drop_fk_if_exists(cursor, table_name: str, constraint_name: str) -> None:
    if _has_foreign_key(cursor, table_name, constraint_name):
        cursor.execute(f"ALTER TABLE `{table_name}` DROP FOREIGN KEY `{constraint_name}`")


def _drop_column_if_exists(cursor, table_name: str, column_name: str) -> None:
    if _has_column(cursor, table_name, column_name):
        cursor.execute(f"ALTER TABLE `{table_name}` DROP COLUMN `{column_name}`")


def _rename_column_if_exists(cursor, table_name: str, source_name: str, target_name: str, definition: str) -> None:
    if _has_column(cursor, table_name, source_name):
        cursor.execute(f"ALTER TABLE `{table_name}` CHANGE COLUMN `{source_name}` `{target_name}` {definition}")


def _modify_column_if_exists(cursor, table_name: str, column_name: str, definition: str) -> None:
    if _has_column(cursor, table_name, column_name):
        cursor.execute(f"ALTER TABLE `{table_name}` MODIFY COLUMN `{column_name}` {definition}")


def _add_index_if_missing(cursor, table_name: str, index_name: str, expression: str, *, unique: bool = False) -> None:
    if _has_index(cursor, table_name, index_name):
        return
    prefix = "ADD UNIQUE KEY" if unique else "ADD INDEX"
    cursor.execute(f"ALTER TABLE `{table_name}` {prefix} `{index_name}` {expression}")


def _require_no_nulls(cursor, table_name: str, column_name: str) -> None:
    if not _has_column(cursor, table_name, column_name):
        return
    cursor.execute(f"SELECT COUNT(*) AS total FROM `{table_name}` WHERE `{column_name}` IS NULL")
    total = int((cursor.fetchone() or {}).get("total") or 0)
    if total:
        raise RuntimeError(f"`{table_name}` still has {total} NULL values in `{column_name}`")


def _cleanup_shared_tables(cursor) -> dict[str, Any]:
    changed: dict[str, Any] = {}

    if _table_exists(cursor, "scheduled_task"):
        _drop_column_if_exists(cursor, "scheduled_task", "model_codes_json")
        _drop_column_if_exists(cursor, "scheduled_task", "weekdays_json")
        changed["scheduled_task"] = True

    if _table_exists(cursor, "model_provider"):
        _drop_column_if_exists(cursor, "model_provider", "extra_options_json")
        changed["model_provider"] = True

    if _table_exists(cursor, "app_user"):
        _require_no_nulls(cursor, "app_user", "role_id")
        _drop_index_if_exists(cursor, "app_user", "idx_app_user_role_active")
        _drop_column_if_exists(cursor, "app_user", "role")
        _modify_column_if_exists(cursor, "app_user", "role_id", "BIGINT NOT NULL")
        _add_index_if_missing(cursor, "app_user", "idx_app_user_role_active", "(role_id, is_active)")
        changed["app_user"] = True

    if _table_exists(cursor, "ai_model"):
        _require_no_nulls(cursor, "ai_model", "provider_model_id")
        _drop_fk_if_exists(cursor, "ai_model", "fk_ai_model_provider")
        _drop_index_if_exists(cursor, "ai_model", "idx_ai_model_provider_active")
        _drop_column_if_exists(cursor, "ai_model", "provider_id")
        _modify_column_if_exists(cursor, "ai_model", "provider_model_id", "BIGINT NOT NULL")
        _add_index_if_missing(cursor, "ai_model", "idx_ai_model_provider_model_active", "(provider_model_id, is_active)")
        changed["ai_model"] = True

    return changed


def _cleanup_split_table_family(cursor, lottery_code: str) -> dict[str, Any]:
    changed: dict[str, Any] = {}
    draw_issue = f"{lottery_code}_draw_issue"
    draw_result = f"{lottery_code}_draw_result"
    prediction_batch = f"{lottery_code}_prediction_batch"
    prediction_hit_summary = f"{lottery_code}_prediction_hit_summary"
    model_batch_summary = f"{lottery_code}_model_batch_summary"
    simulation_ticket = f"{lottery_code}_simulation_ticket"
    my_bet_record = f"{lottery_code}_my_bet_record"
    my_bet_record_line = f"{lottery_code}_my_bet_record_line"
    my_bet_record_meta = f"{lottery_code}_my_bet_record_meta"

    if _table_exists(cursor, draw_issue):
        _drop_index_if_exists(cursor, draw_issue, "idx_draw_issue_status_date")
        _drop_index_if_exists(cursor, draw_issue, "idx_draw_issue_draw_date")
        if _has_column(cursor, draw_issue, "draw_date_v2"):
            _drop_column_if_exists(cursor, draw_issue, "draw_date")
            _rename_column_if_exists(cursor, draw_issue, "draw_date_v2", "draw_date", "DATE NULL")
        if _has_column(cursor, draw_issue, "sales_close_at_v2"):
            _drop_column_if_exists(cursor, draw_issue, "sales_close_at")
            _rename_column_if_exists(cursor, draw_issue, "sales_close_at_v2", "sales_close_at", "DATETIME NULL")
        _drop_column_if_exists(cursor, draw_issue, "lottery_code")
        _add_index_if_missing(cursor, draw_issue, "idx_draw_issue_status_date", "(status, draw_date)")
        _add_index_if_missing(cursor, draw_issue, "idx_draw_issue_draw_date", "(draw_date)")
        changed[draw_issue] = True

    if _table_exists(cursor, draw_result):
        _drop_column_if_exists(cursor, draw_result, "red_hit_count_rule")
        _drop_column_if_exists(cursor, draw_result, "blue_hit_count_rule")
        changed[draw_result] = True

    if _table_exists(cursor, prediction_batch):
        if _has_column(cursor, prediction_batch, "prediction_date_v2"):
            _require_no_nulls(cursor, prediction_batch, "prediction_date_v2")
            _drop_column_if_exists(cursor, prediction_batch, "prediction_date")
            _rename_column_if_exists(cursor, prediction_batch, "prediction_date_v2", "prediction_date", "DATE NOT NULL")
        _drop_index_if_exists(cursor, prediction_batch, "idx_prediction_batch_status_date")
        _drop_column_if_exists(cursor, prediction_batch, "lottery_code")
        _add_index_if_missing(cursor, prediction_batch, "idx_prediction_batch_status_date", "(status, prediction_date)")
        _add_index_if_missing(cursor, prediction_batch, "uq_prediction_batch_issue_status", "(target_issue_id, status)", unique=True)
        changed[prediction_batch] = True

    if _table_exists(cursor, prediction_hit_summary):
        _drop_index_if_exists(cursor, prediction_hit_summary, "idx_prediction_hit_summary_total")
        _drop_column_if_exists(cursor, prediction_hit_summary, "total_hit_count")
        changed[prediction_hit_summary] = True

    if _table_exists(cursor, model_batch_summary):
        _drop_column_if_exists(cursor, model_batch_summary, "best_hit_count")
        changed[model_batch_summary] = True

    if _table_exists(cursor, simulation_ticket):
        _drop_index_if_exists(cursor, simulation_ticket, "idx_simulation_ticket_user_created")
        for column_name in (
            "lottery_code",
            "front_numbers",
            "back_numbers",
            "direct_ten_thousands",
            "direct_thousands",
            "direct_hundreds",
            "direct_tens",
            "direct_units",
            "group_numbers",
        ):
            _drop_column_if_exists(cursor, simulation_ticket, column_name)
        _add_index_if_missing(cursor, simulation_ticket, "idx_simulation_ticket_user_created", "(user_id, created_at)")
        changed[simulation_ticket] = True

    if _table_exists(cursor, my_bet_record):
        _drop_index_if_exists(cursor, my_bet_record, "idx_my_bet_record_user_period")
        for column_name in (
            "lottery_code",
            "front_numbers",
            "back_numbers",
            "direct_ten_thousands",
            "direct_thousands",
            "direct_hundreds",
            "direct_tens",
            "direct_units",
            "group_numbers",
        ):
            _drop_column_if_exists(cursor, my_bet_record, column_name)
        _add_index_if_missing(cursor, my_bet_record, "idx_my_bet_record_user_period", "(user_id, target_period, created_at)")
        changed[my_bet_record] = True

    if _table_exists(cursor, my_bet_record_line):
        for column_name in (
            "lottery_code",
            "front_numbers",
            "back_numbers",
            "direct_ten_thousands",
            "direct_thousands",
            "direct_hundreds",
            "direct_tens",
            "direct_units",
            "group_numbers",
        ):
            _drop_column_if_exists(cursor, my_bet_record_line, column_name)
        changed[my_bet_record_line] = True

    if _table_exists(cursor, my_bet_record_meta):
        _drop_index_if_exists(cursor, my_bet_record_meta, "idx_my_bet_record_meta_lottery_created")
        _drop_column_if_exists(cursor, my_bet_record_meta, "lottery_code")
        _add_index_if_missing(cursor, my_bet_record_meta, "idx_my_bet_record_meta_created", "(created_at)")
        changed[my_bet_record_meta] = True

    return changed


def cleanup_phase5_schema() -> dict[str, Any]:
    settings = load_settings()
    if settings.mysql_database != "letoume_dev":
        raise RuntimeError(f"当前数据库不是 letoume_dev: {settings.mysql_database}")

    summary: dict[str, Any] = {"database": settings.mysql_database, "tables": {}}
    with get_connection() as connection:
        with connection.cursor() as cursor:
            summary["tables"].update(_cleanup_shared_tables(cursor))
            for lottery_code in SUPPORTED_LOTTERY_CODES:
                summary["tables"].update(_cleanup_split_table_family(cursor, lottery_code))
    return summary


def main() -> None:
    args = _parse_args()
    settings = load_settings()
    if settings.mysql_database != "letoume_dev" and not args.allow_non_dev:
        raise RuntimeError(f"为避免误操作，此脚本默认只允许在 letoume_dev 上执行，当前数据库: {settings.mysql_database}")

    if not args.skip_backup:
        backup_path = backup_mysql_database(file_prefix="pre_phase5_cleanup")
        logger.info("MySQL backup completed before phase-5 cleanup", extra={"context": {"backup_file": str(backup_path)}})

    summary = cleanup_phase5_schema()
    logger.info("Phase-5 legacy schema cleanup completed", extra={"context": summary})
    print(summary["database"])


if __name__ == "__main__":
    main()
