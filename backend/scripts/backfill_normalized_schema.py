from __future__ import annotations

import argparse
import json
from datetime import datetime
from typing import Any

from backend.app.config import load_settings
from backend.app.db.connection import ensure_schema, get_connection
from backend.app.lotteries import SUPPORTED_LOTTERY_CODES
from backend.app.logging_utils import get_logger
from backend.app.number_codec import build_number_rows
from backend.app.rbac import ensure_rbac_setup


logger = get_logger("scripts.backfill_normalized_schema")


DATE_FORMATS = ("%Y-%m-%d", "%Y/%m/%d")
DATETIME_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill normalized helper tables and compatibility columns.")
    parser.add_argument("--strict", action="store_true", help="Stop on the first data inconsistency.")
    return parser.parse_args()


def _parse_date(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    for fmt in DATETIME_FORMATS:
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _parse_datetime(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    normalized = text.replace("T", " ").replace("Z", "")
    for fmt in DATETIME_FORMATS + DATE_FORMATS:
        try:
            parsed = datetime.strptime(normalized, fmt.replace("T", " ").replace("Z", ""))
            if fmt in DATE_FORMATS:
                return parsed.strftime("%Y-%m-%d 00:00:00")
            return parsed.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    return None


def _existing_lottery_tables(base_name: str) -> list[str]:
    return [f"{lottery_code}_{base_name}" for lottery_code in SUPPORTED_LOTTERY_CODES]


def _resolve_model_id_map(cursor) -> dict[str, int]:
    cursor.execute("SELECT id, model_code FROM ai_model")
    return {str(row["model_code"]): int(row["id"]) for row in cursor.fetchall()}


def _backfill_scheduled_task_relations(cursor, *, strict: bool) -> None:
    model_id_map = _resolve_model_id_map(cursor)
    cursor.execute("DELETE FROM scheduled_task_model")
    cursor.execute("DELETE FROM scheduled_task_weekday")
    cursor.execute("SELECT id, model_codes_json, weekdays_json FROM scheduled_task ORDER BY id ASC")
    for row in cursor.fetchall():
        task_id = int(row["id"])
        try:
            model_codes = json.loads(row.get("model_codes_json") or "[]")
        except Exception:
            model_codes = []
        normalized_codes = [str(code).strip() for code in (model_codes if isinstance(model_codes, list) else []) if str(code).strip()]
        missing_codes = [code for code in normalized_codes if code not in model_id_map]
        if missing_codes:
            message = f"scheduled_task {task_id} 引用了未知模型: {', '.join(missing_codes)}"
            if strict:
                raise RuntimeError(message)
            logger.warning(message)
        for sort_order, model_code in enumerate([code for code in normalized_codes if code in model_id_map], start=1):
            cursor.execute(
                """
                INSERT INTO scheduled_task_model (task_id, model_id, sort_order)
                VALUES (?, ?, ?)
                """,
                (task_id, model_id_map[model_code], sort_order),
            )
        try:
            weekdays = json.loads(row.get("weekdays_json") or "[]")
        except Exception:
            weekdays = []
        for weekday in sorted({int(value) for value in (weekdays if isinstance(weekdays, list) else []) if str(value).strip()}):
            cursor.execute(
                """
                INSERT INTO scheduled_task_weekday (task_id, weekday)
                VALUES (?, ?)
                """,
                (task_id, weekday),
            )


def _backfill_provider_options(cursor) -> None:
    cursor.execute("DELETE FROM model_provider_option")
    cursor.execute("SELECT id, extra_options_json FROM model_provider ORDER BY id ASC")
    for row in cursor.fetchall():
        provider_id = int(row["id"])
        try:
            parsed = json.loads(str(row.get("extra_options_json") or ""))
        except Exception:
            parsed = {}
        if not isinstance(parsed, dict):
            continue
        for option_key, option_value in sorted(parsed.items()):
            cursor.execute(
                """
                INSERT INTO model_provider_option (provider_id, option_key, option_value)
                VALUES (?, ?, ?)
                """,
                (provider_id, str(option_key), json.dumps(option_value, ensure_ascii=False)),
            )


def _backfill_role_ids(cursor, *, strict: bool) -> None:
    cursor.execute(
        """
        UPDATE app_user au
        INNER JOIN app_role ar ON ar.role_code = au.role
        SET au.role_id = ar.id
        WHERE au.role_id IS NULL OR au.role_id <> ar.id
        """
    )
    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM app_user
        WHERE (role IS NOT NULL AND role != '') AND role_id IS NULL
        """
    )
    remaining = int((cursor.fetchone() or {}).get("total") or 0)
    if remaining and strict:
        raise RuntimeError(f"仍有 {remaining} 个用户未能回填 role_id")


def _backfill_provider_model_bindings(cursor) -> None:
    cursor.execute(
        """
        SELECT id, provider_id, model_code, display_name, api_model_name
        FROM ai_model
        WHERE provider_model_id IS NULL
        ORDER BY id ASC
        """
    )
    for row in cursor.fetchall():
        model_id = int(row["id"])
        provider_id = int(row["provider_id"])
        provider_model_name = str(row.get("api_model_name") or "").strip() or str(row.get("model_code") or "").strip()
        display_name = str(row.get("display_name") or provider_model_name).strip() or provider_model_name
        cursor.execute(
            """
            SELECT id
            FROM provider_model_config
            WHERE provider_id = ? AND model_id = ?
            LIMIT 1
            """,
            (provider_id, provider_model_name),
        )
        existing = cursor.fetchone()
        if existing:
            provider_model_id = int(existing["id"])
        else:
            cursor.execute(
                """
                INSERT INTO provider_model_config (provider_id, model_id, display_name, sort_order, is_deleted)
                VALUES (?, ?, ?, ?, 0)
                """,
                (provider_id, provider_model_name, display_name, 9999 + model_id),
            )
            provider_model_id = int(cursor.lastrowid)
        cursor.execute(
            """
            UPDATE ai_model
            SET provider_model_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (provider_model_id, model_id),
        )


def _backfill_draw_issue_dates(cursor, table_name: str) -> None:
    cursor.execute(f"SELECT id, issue_no, draw_date, sales_close_at FROM `{table_name}` ORDER BY id ASC")
    for row in cursor.fetchall():
        issue_no = str(row.get("issue_no") or "")
        next_issue_no = issue_no
        if table_name.startswith("pl3_") and issue_no.startswith("pl3:"):
            next_issue_no = issue_no[4:]
        if table_name.startswith("pl5_") and issue_no.startswith("pl5:"):
            next_issue_no = issue_no[4:]
        cursor.execute(
            f"""
            UPDATE `{table_name}`
            SET issue_no = ?,
                draw_date_v2 = ?,
                sales_close_at_v2 = ?
            WHERE id = ?
            """,
            (
                next_issue_no,
                _parse_date(row.get("draw_date")),
                _parse_datetime(row.get("sales_close_at")),
                int(row["id"]),
            ),
        )


def _backfill_prediction_batch_dates(cursor, table_name: str) -> None:
    cursor.execute(f"SELECT id, prediction_date FROM `{table_name}` ORDER BY id ASC")
    for row in cursor.fetchall():
        cursor.execute(
            f"UPDATE `{table_name}` SET prediction_date_v2 = ? WHERE id = ?",
            (_parse_date(row.get("prediction_date")), int(row["id"])),
        )


def _backfill_number_table(cursor, *, source_table: str, target_table: str, owner_field: str) -> None:
    cursor.execute(f"DELETE FROM `{target_table}`")
    cursor.execute(
        f"""
        SELECT id,
               front_numbers,
               back_numbers,
               direct_ten_thousands,
               direct_thousands,
               direct_hundreds,
               direct_tens,
               direct_units,
               group_numbers
        FROM `{source_table}`
        ORDER BY id ASC
        """
    )
    for row in cursor.fetchall():
        owner_id = int(row["id"])
        for number_role, number_position, number_value in build_number_rows(row):
            cursor.execute(
                f"""
                INSERT INTO `{target_table}` ({owner_field}, number_role, number_position, number_value)
                VALUES (?, ?, ?, ?)
                """,
                (owner_id, number_role, number_position, number_value),
            )


def _backfill_hit_positions(cursor, *, summary_table: str, group_number_table: str, hit_table: str, group_id_field: str) -> None:
    cursor.execute(
        f"""
        SELECT hs.id AS summary_id, hs.{group_id_field} AS prediction_group_id
        FROM `{summary_table}` hs
        ORDER BY hs.id ASC
        """
    )
    summary_rows = cursor.fetchall()
    if not summary_rows:
        return
    group_ids = [int(row["prediction_group_id"]) for row in summary_rows]
    placeholders = ", ".join("?" for _ in group_ids)
    cursor.execute(
        f"""
        SELECT prediction_group_id, ball_color, ball_position, ball_value
        FROM `{group_number_table}`
        WHERE prediction_group_id IN ({placeholders})
        ORDER BY prediction_group_id ASC, ball_color ASC, ball_position ASC
        """,
        tuple(group_ids),
    )
    positions_by_group: dict[int, dict[tuple[str, str], list[int]]] = {}
    for row in cursor.fetchall():
        positions_by_group.setdefault(int(row["prediction_group_id"]), {}).setdefault(
            (str(row["ball_color"]), str(row["ball_value"])),
            [],
        ).append(int(row["ball_position"]))

    summary_ids = [int(row["summary_id"]) for row in summary_rows]
    placeholders = ", ".join("?" for _ in summary_ids)
    cursor.execute(
        f"""
        SELECT id, hit_summary_id, ball_color, ball_value
        FROM `{hit_table}`
        WHERE hit_summary_id IN ({placeholders})
        ORDER BY hit_summary_id ASC, id ASC
        """,
        tuple(summary_ids),
    )
    summary_to_group = {int(row["summary_id"]): int(row["prediction_group_id"]) for row in summary_rows}
    used_positions: dict[int, set[tuple[str, int]]] = {}
    for row in cursor.fetchall():
        summary_id = int(row["hit_summary_id"])
        group_id = summary_to_group.get(summary_id)
        if group_id is None:
            continue
        candidates = positions_by_group.get(group_id, {}).get((str(row["ball_color"]), str(row["ball_value"])), [])
        assigned_position = None
        used_for_summary = used_positions.setdefault(summary_id, set())
        for candidate in candidates:
            marker = (str(row["ball_color"]), candidate)
            if marker not in used_for_summary:
                assigned_position = candidate
                used_for_summary.add(marker)
                break
        if assigned_position is None:
            continue
        cursor.execute(
            f"UPDATE `{hit_table}` SET ball_position = ? WHERE id = ?",
            (assigned_position, int(row["id"])),
        )


def main() -> None:
    args = _parse_args()
    settings = load_settings()
    ensure_schema()
    ensure_rbac_setup()

    with get_connection() as connection:
        with connection.cursor() as cursor:
            _backfill_scheduled_task_relations(cursor, strict=bool(args.strict))
            _backfill_provider_options(cursor)
            _backfill_role_ids(cursor, strict=bool(args.strict))
            _backfill_provider_model_bindings(cursor)

            for table_name in _existing_lottery_tables("draw_issue"):
                _backfill_draw_issue_dates(cursor, table_name)
            for table_name in _existing_lottery_tables("prediction_batch"):
                _backfill_prediction_batch_dates(cursor, table_name)
            for lottery_code in SUPPORTED_LOTTERY_CODES:
                _backfill_number_table(
                    cursor,
                    source_table=f"{lottery_code}_my_bet_record_line",
                    target_table=f"{lottery_code}_my_bet_record_line_number",
                    owner_field="line_id",
                )
                _backfill_number_table(
                    cursor,
                    source_table=f"{lottery_code}_simulation_ticket",
                    target_table=f"{lottery_code}_simulation_ticket_number",
                    owner_field="ticket_id",
                )
                _backfill_hit_positions(
                    cursor,
                    summary_table=f"{lottery_code}_prediction_hit_summary",
                    group_number_table=f"{lottery_code}_prediction_group_number",
                    hit_table=f"{lottery_code}_prediction_hit_number",
                    group_id_field="prediction_group_id",
                )

    logger.info(
        "Normalized schema backfill completed",
        extra={"context": {"database": settings.mysql_database, "strict": bool(args.strict)}},
    )
    print(settings.mysql_database)


if __name__ == "__main__":
    main()
