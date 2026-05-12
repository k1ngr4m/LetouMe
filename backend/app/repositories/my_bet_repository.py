from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from backend.app.db.connection import get_connection
from backend.app.db.lottery_tables import use_lottery_table_scope
from backend.app.number_codec import EMPTY_NUMBER_FIELDS, build_number_rows, with_number_fields, merge_number_rows
from backend.app.lotteries import storage_issue_no
from backend.app.time_utils import BEIJING_TIMEZONE, beijing_date_end_ts, beijing_date_start_ts, ensure_timestamp, format_beijing_datetime, now_ts


def _add_months(value: datetime, delta: int) -> datetime:
    month_index = value.month - 1 + delta
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    month_lengths = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return value.replace(year=year, month=month, day=min(value.day, month_lengths[month - 1]))


class MyBetRepository:
    _record_time_storage_mode: str | None = None
    _meta_time_storage_mode: str | None = None

    @staticmethod
    def _append_text_filter(where_clauses: list[str], params: list[Any], column_sql: str, value: str, operator: str) -> None:
        normalized_value = str(value or "").strip()
        normalized_operator = str(operator or "contains").strip().lower()
        if normalized_operator == "empty":
            where_clauses.append(f"({column_sql} IS NULL OR {column_sql} = '')")
            return
        if normalized_operator == "not_empty":
            where_clauses.append(f"({column_sql} IS NOT NULL AND {column_sql} <> '')")
            return
        if not normalized_value:
            return
        if normalized_operator == "eq":
            where_clauses.append(f"{column_sql} = ?")
            params.append(normalized_value)
        elif normalized_operator == "ne":
            where_clauses.append(f"({column_sql} IS NULL OR {column_sql} <> ?)")
            params.append(normalized_value)
        else:
            where_clauses.append(f"{column_sql} LIKE ?")
            params.append(f"%{normalized_value}%")

    @staticmethod
    def _append_enum_filter(where_clauses: list[str], params: list[Any], column_sql: str, value: str, operator: str, *, default_value: str | None = None) -> None:
        normalized_value = str(value or "").strip().lower() or (default_value or "")
        normalized_operator = str(operator or "eq").strip().lower()
        if normalized_operator == "empty":
            where_clauses.append(f"({column_sql} IS NULL OR {column_sql} = '')")
            return
        if normalized_operator == "not_empty":
            where_clauses.append(f"({column_sql} IS NOT NULL AND {column_sql} <> '')")
            return
        if not normalized_value:
            return
        if normalized_operator == "ne":
            where_clauses.append(f"({column_sql} IS NULL OR {column_sql} <> ?)")
            params.append(normalized_value)
        else:
            where_clauses.append(f"{column_sql} = ?")
            params.append(normalized_value)

    @staticmethod
    def _append_date_filter(
        where_clauses: list[str],
        params: list[Any],
        *,
        column_sql: str,
        value: Any,
        operator: str,
        cursor: Any,
    ) -> None:
        normalized_operator = str(operator or "gte").strip().lower()
        if normalized_operator == "empty":
            where_clauses.append(f"({column_sql} IS NULL OR {column_sql} = '')")
            return
        if normalized_operator == "not_empty":
            where_clauses.append(f"({column_sql} IS NOT NULL AND {column_sql} <> '')")
            return
        if value is None or str(value).strip() == "":
            return
        record_storage_mode = MyBetRepository._resolve_record_time_storage_mode(cursor)
        meta_storage_mode = MyBetRepository._resolve_meta_time_storage_mode(cursor)
        start_value = MyBetRepository._normalize_filter_time_value(
            beijing_date_start_ts(value),
            record_storage_mode=record_storage_mode,
            meta_storage_mode=meta_storage_mode,
        )
        end_value = MyBetRepository._normalize_filter_time_value(
            beijing_date_end_ts(value),
            record_storage_mode=record_storage_mode,
            meta_storage_mode=meta_storage_mode,
        )
        if normalized_operator == "eq":
            where_clauses.append(f"({column_sql} >= ? AND {column_sql} <= ?)")
            params.extend([start_value, end_value])
            return
        if normalized_operator == "ne":
            where_clauses.append(f"({column_sql} IS NULL OR {column_sql} < ? OR {column_sql} > ?)")
            params.extend([start_value, end_value])
            return
        comparator = {
            "gt": ">",
            "gte": ">=",
            "lt": "<",
            "lte": "<=",
        }.get(normalized_operator, ">=")
        normalized_value = start_value if normalized_operator in {"gt", "gte"} else end_value
        where_clauses.append(f"{column_sql} {comparator} ?")
        params.append(normalized_value)

    @staticmethod
    def _resolve_dynamic_date_range(dynamic_key: Any, *, start_value: Any = None, end_value: Any = None) -> tuple[str, str] | None:
        normalized_key = str(dynamic_key or "").strip().lower()
        today = datetime.fromtimestamp(now_ts(), BEIJING_TIMEZONE).date()

        def date_text(value: datetime | Any) -> str:
            if isinstance(value, datetime):
                return value.strftime("%Y-%m-%d")
            return str(value)

        def resolve_custom(value: Any) -> datetime | None:
            parts = str(value or "").strip().lower().split(":")
            if len(parts) != 3:
                return None
            direction, amount_text, unit = parts
            try:
                amount = int(amount_text)
            except ValueError:
                return None
            base = datetime.combine(today, datetime.min.time())
            sign = -1 if direction == "past" else 1 if direction == "future" else 0
            if unit == "week":
                return base + timedelta(days=sign * amount * 7)
            if unit == "month":
                return _add_months(base, sign * amount)
            return base + timedelta(days=sign * amount)

        if normalized_key == "today":
            return date_text(datetime.combine(today, datetime.min.time())), date_text(datetime.combine(today, datetime.min.time()))
        if normalized_key == "yesterday":
            day = today - timedelta(days=1)
            return date_text(datetime.combine(day, datetime.min.time())), date_text(datetime.combine(day, datetime.min.time()))
        if normalized_key == "tomorrow":
            day = today + timedelta(days=1)
            return date_text(datetime.combine(day, datetime.min.time())), date_text(datetime.combine(day, datetime.min.time()))

        week_start = today - timedelta(days=today.weekday())
        month_start = today.replace(day=1)
        quarter_start_month = ((today.month - 1) // 3) * 3 + 1
        quarter_start = today.replace(month=quarter_start_month, day=1)
        half_start_month = 1 if today.month <= 6 else 7
        half_start = today.replace(month=half_start_month, day=1)
        year_start = today.replace(month=1, day=1)

        if normalized_key == "this_week":
            return date_text(datetime.combine(week_start, datetime.min.time())), date_text(datetime.combine(week_start + timedelta(days=6), datetime.min.time()))
        if normalized_key == "last_week":
            start = week_start - timedelta(days=7)
            return date_text(datetime.combine(start, datetime.min.time())), date_text(datetime.combine(start + timedelta(days=6), datetime.min.time()))
        if normalized_key == "next_week":
            start = week_start + timedelta(days=7)
            return date_text(datetime.combine(start, datetime.min.time())), date_text(datetime.combine(start + timedelta(days=6), datetime.min.time()))
        if normalized_key == "this_month":
            end = _add_months(datetime.combine(month_start, datetime.min.time()), 1).date() - timedelta(days=1)
            return date_text(datetime.combine(month_start, datetime.min.time())), date_text(datetime.combine(end, datetime.min.time()))
        if normalized_key == "last_month":
            start = _add_months(datetime.combine(month_start, datetime.min.time()), -1).date()
            return date_text(datetime.combine(start, datetime.min.time())), date_text(datetime.combine(month_start - timedelta(days=1), datetime.min.time()))
        if normalized_key == "next_month":
            start = _add_months(datetime.combine(month_start, datetime.min.time()), 1).date()
            end = _add_months(datetime.combine(month_start, datetime.min.time()), 2).date() - timedelta(days=1)
            return date_text(datetime.combine(start, datetime.min.time())), date_text(datetime.combine(end, datetime.min.time()))
        if normalized_key == "this_quarter":
            end = _add_months(datetime.combine(quarter_start, datetime.min.time()), 3).date() - timedelta(days=1)
            return date_text(datetime.combine(quarter_start, datetime.min.time())), date_text(datetime.combine(end, datetime.min.time()))
        if normalized_key == "last_quarter":
            start = _add_months(datetime.combine(quarter_start, datetime.min.time()), -3).date()
            return date_text(datetime.combine(start, datetime.min.time())), date_text(datetime.combine(quarter_start - timedelta(days=1), datetime.min.time()))
        if normalized_key == "next_quarter":
            start = _add_months(datetime.combine(quarter_start, datetime.min.time()), 3).date()
            end = _add_months(datetime.combine(quarter_start, datetime.min.time()), 6).date() - timedelta(days=1)
            return date_text(datetime.combine(start, datetime.min.time())), date_text(datetime.combine(end, datetime.min.time()))
        if normalized_key == "first_half":
            start = today.replace(month=1, day=1)
            end = today.replace(month=6, day=30)
            return date_text(datetime.combine(start, datetime.min.time())), date_text(datetime.combine(end, datetime.min.time()))
        if normalized_key == "second_half":
            start = today.replace(month=7, day=1)
            end = today.replace(month=12, day=31)
            return date_text(datetime.combine(start, datetime.min.time())), date_text(datetime.combine(end, datetime.min.time()))
        if normalized_key == "this_year":
            end = today.replace(month=12, day=31)
            return date_text(datetime.combine(year_start, datetime.min.time())), date_text(datetime.combine(end, datetime.min.time()))
        if normalized_key == "last_year":
            start = today.replace(year=today.year - 1, month=1, day=1)
            end = today.replace(year=today.year - 1, month=12, day=31)
            return date_text(datetime.combine(start, datetime.min.time())), date_text(datetime.combine(end, datetime.min.time()))
        if normalized_key == "next_year":
            start = today.replace(year=today.year + 1, month=1, day=1)
            end = today.replace(year=today.year + 1, month=12, day=31)
            return date_text(datetime.combine(start, datetime.min.time())), date_text(datetime.combine(end, datetime.min.time()))
        if normalized_key == "custom":
            start = resolve_custom(start_value)
            end = resolve_custom(end_value)
            if start and end:
                first, second = (start, end) if start <= end else (end, start)
                return date_text(first), date_text(second)
        return None

    @staticmethod
    def _append_date_range_filter(
        where_clauses: list[str],
        params: list[Any],
        *,
        column_sql: str,
        start_value: Any,
        end_value: Any,
        cursor: Any,
    ) -> None:
        if not str(start_value or "").strip() or not str(end_value or "").strip():
            return
        record_storage_mode = MyBetRepository._resolve_record_time_storage_mode(cursor)
        meta_storage_mode = MyBetRepository._resolve_meta_time_storage_mode(cursor)
        normalized_start = MyBetRepository._normalize_filter_time_value(
            beijing_date_start_ts(start_value),
            record_storage_mode=record_storage_mode,
            meta_storage_mode=meta_storage_mode,
        )
        normalized_end = MyBetRepository._normalize_filter_time_value(
            beijing_date_end_ts(end_value),
            record_storage_mode=record_storage_mode,
            meta_storage_mode=meta_storage_mode,
        )
        where_clauses.append(f"({column_sql} >= ? AND {column_sql} <= ?)")
        params.extend([normalized_start, normalized_end])

    @staticmethod
    def _append_date_field_filter(
        where_clauses: list[str],
        params: list[Any],
        *,
        column_sql: str,
        value: Any,
        start_value: Any,
        end_value: Any,
        operator: str,
        dynamic_key: Any,
        dynamic_start: Any,
        dynamic_end: Any,
        cursor: Any,
    ) -> None:
        normalized_operator = str(operator or "eq").strip().lower()
        if normalized_operator == "range":
            MyBetRepository._append_date_range_filter(where_clauses, params, column_sql=column_sql, start_value=start_value, end_value=end_value, cursor=cursor)
            return
        if normalized_operator == "dynamic":
            dynamic_range = MyBetRepository._resolve_dynamic_date_range(dynamic_key, start_value=dynamic_start, end_value=dynamic_end)
            if dynamic_range:
                MyBetRepository._append_date_range_filter(where_clauses, params, column_sql=column_sql, start_value=dynamic_range[0], end_value=dynamic_range[1], cursor=cursor)
            return
        MyBetRepository._append_date_filter(where_clauses, params, column_sql=column_sql, value=value, operator=normalized_operator, cursor=cursor)

    def list_records(
        self,
        user_id: int,
        lottery_code: str = "dlt",
        *,
        limit: int | None = 20,
        offset: int = 0,
        filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    limit_clause = ""
                    where_sql, params = self._build_list_where_clause(
                        cursor,
                        user_id,
                        lottery_code=lottery_code,
                        filters=filters,
                    )
                    if limit is not None:
                        limit_clause = "LIMIT ? OFFSET ?"
                        params.extend([int(limit), int(offset)])
                    cursor.execute(
                        f"""
                        SELECT
                            record.id,
                            record.user_id,
                            record.target_period,
                            record.play_type,
                            record.multiplier,
                            record.is_append,
                            record.bet_count,
                            record.amount,
                            record.discount_amount,
                            record.created_at,
                            record.updated_at,
                            meta.source_type,
                            meta.ticket_image_url,
                            meta.ocr_text,
                            meta.ocr_provider,
                            meta.ocr_recognized_at,
                            meta.ticket_purchased_at
                        FROM my_bet_record AS record
                        LEFT JOIN my_bet_record_meta AS meta ON meta.record_id = record.id
                        WHERE {where_sql}
                        ORDER BY record.target_period DESC, record.created_at DESC, record.id DESC
                        {limit_clause}
                        """,
                        tuple(params),
                    )
                    records = cursor.fetchall()
                    line_map = self._list_lines_map(cursor, [int(item["id"]) for item in records])
                    return [
                        self._compose_record_payload(item, line_map.get(int(item["id"]), []), lottery_code=lottery_code)
                        for item in records
                    ]

    @staticmethod
    def _build_list_where_clause(cursor: Any, user_id: int, *, lottery_code: str, filters: dict[str, Any] | None = None) -> tuple[str, list[Any]]:
        normalized_filters = filters or {}
        where_clauses = ["record.user_id = ?"]
        params: list[Any] = [int(user_id)]

        period_query = str(normalized_filters.get("period_query") or "").strip()
        period_query_operator = str(normalized_filters.get("period_query_operator") or "contains").strip().lower()
        if period_query_operator in {"empty", "not_empty"}:
            MyBetRepository._append_text_filter(where_clauses, params, "record.target_period", "", period_query_operator)
        elif period_query:
            if period_query_operator == "eq":
                where_clauses.append("record.target_period = ?")
                params.append(storage_issue_no(lottery_code, period_query))
            elif period_query_operator == "ne":
                where_clauses.append("(record.target_period IS NULL OR record.target_period <> ?)")
                params.append(storage_issue_no(lottery_code, period_query))
            else:
                where_clauses.append("record.target_period LIKE ?")
                params.append(f"%{storage_issue_no(lottery_code, period_query)}%")

        play_type_filter = str(normalized_filters.get("play_type_filter") or "").strip().lower()
        play_type_filter_operator = str(normalized_filters.get("play_type_filter_operator") or "eq").strip().lower()
        if (play_type_filter and play_type_filter != "all") or play_type_filter_operator in {"empty", "not_empty"}:
            MyBetRepository._append_enum_filter(
                where_clauses,
                params,
                "record.play_type",
                play_type_filter,
                play_type_filter_operator,
            )

        source_type_filter = str(normalized_filters.get("source_type_filter") or "all").strip().lower()
        if source_type_filter in {"manual", "ocr"}:
            where_clauses.append("COALESCE(meta.source_type, 'manual') = ?")
            params.append(source_type_filter)

        settlement_status_filter = str(normalized_filters.get("settlement_status_filter") or "all").strip().lower()
        settlement_status_filter_operator = str(normalized_filters.get("settlement_status_filter_operator") or "eq").strip().lower()
        if settlement_status_filter_operator == "empty":
            where_clauses.append("1 = 0")
        elif settlement_status_filter_operator == "not_empty":
            where_clauses.append("1 = 1")
        elif settlement_status_filter in {"settled", "pending"}:
            settlement_clause = (
                "EXISTS (SELECT 1 FROM draw_issue di INNER JOIN draw_result dr ON dr.issue_id = di.id WHERE di.issue_no = record.target_period)"
                if settlement_status_filter == "settled"
                else "NOT EXISTS (SELECT 1 FROM draw_issue di INNER JOIN draw_result dr ON dr.issue_id = di.id WHERE di.issue_no = record.target_period)"
            )
            if settlement_status_filter_operator == "ne":
                where_clauses.append(f"NOT ({settlement_clause})")
            else:
                where_clauses.append(settlement_clause)

        MyBetRepository._append_date_filter(
            where_clauses,
            params,
            column_sql="COALESCE(meta.ticket_purchased_at, record.created_at)",
            value=normalized_filters.get("date_start"),
            operator=str(normalized_filters.get("date_start_operator") or "gte"),
            cursor=cursor,
        )
        MyBetRepository._append_date_filter(
            where_clauses,
            params,
            column_sql="COALESCE(meta.ticket_purchased_at, record.created_at)",
            value=normalized_filters.get("date_end"),
            operator=str(normalized_filters.get("date_end_operator") or "lte"),
            cursor=cursor,
        )
        MyBetRepository._append_date_field_filter(
            where_clauses,
            params,
            column_sql="COALESCE(meta.ticket_purchased_at, record.created_at)",
            value=normalized_filters.get("ticket_time_value"),
            start_value=normalized_filters.get("ticket_time_start"),
            end_value=normalized_filters.get("ticket_time_end"),
            operator=str(normalized_filters.get("ticket_time_operator") or "eq"),
            dynamic_key=normalized_filters.get("ticket_time_dynamic"),
            dynamic_start=normalized_filters.get("ticket_time_dynamic_start"),
            dynamic_end=normalized_filters.get("ticket_time_dynamic_end"),
            cursor=cursor,
        )
        MyBetRepository._append_date_field_filter(
            where_clauses,
            params,
            column_sql="record.created_at",
            value=normalized_filters.get("created_time_value"),
            start_value=normalized_filters.get("created_time_start"),
            end_value=normalized_filters.get("created_time_end"),
            operator=str(normalized_filters.get("created_time_operator") or "eq"),
            dynamic_key=normalized_filters.get("created_time_dynamic"),
            dynamic_start=normalized_filters.get("created_time_dynamic_start"),
            dynamic_end=normalized_filters.get("created_time_dynamic_end"),
            cursor=cursor,
        )

        return " AND ".join(where_clauses), params

    @staticmethod
    def _normalize_filter_time_value(value: Any, *, record_storage_mode: str, meta_storage_mode: str) -> int | str:
        if value is None:
            return ""
        if record_storage_mode == "epoch" and meta_storage_mode == "epoch":
            return int(value)
        return format_beijing_datetime(value, with_seconds=True) or int(value)

    def create_record(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        lottery_code = str(payload.get("lottery_code") or "dlt")
        current_timestamp = now_ts()
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    current_time = self._normalize_record_time_value(
                        current_timestamp,
                        storage_mode=self._resolve_record_time_storage_mode(cursor),
                    )
                    cursor.execute(
                        """
                        INSERT INTO my_bet_record (
                            user_id,
                            target_period,
                            play_type,
                            multiplier,
                            is_append,
                            bet_count,
                            amount,
                            discount_amount,
                            created_at,
                            updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            user_id,
                            str(payload.get("target_period") or ""),
                            str(payload.get("play_type") or "dlt"),
                            int(payload.get("multiplier") or 1),
                            1 if bool(payload.get("is_append")) else 0,
                            int(payload.get("bet_count") or 0),
                            int(payload.get("amount") or 0),
                            int(payload.get("discount_amount") or 0),
                            current_time,
                            current_time,
                        ),
                    )
                    record_id = int(cursor.lastrowid)
                    self._replace_lines(cursor, record_id=record_id, lottery_code=lottery_code, lines=payload.get("lines"))
                    self._upsert_meta(cursor, record_id=record_id, lottery_code=lottery_code, payload=payload)
        return self.get_record(record_id, user_id, lottery_code=lottery_code) or {}

    def update_record(self, record_id: int, user_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
        lottery_code = str(payload.get("lottery_code") or "dlt")
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    current_time = self._normalize_record_time_value(
                        now_ts(),
                        storage_mode=self._resolve_record_time_storage_mode(cursor),
                    )
                    cursor.execute(
                        """
                        UPDATE my_bet_record
                        SET
                            target_period = ?,
                            play_type = ?,
                            multiplier = ?,
                            is_append = ?,
                            bet_count = ?,
                            amount = ?,
                            discount_amount = ?,
                            updated_at = ?
                        WHERE id = ? AND user_id = ?
                        """,
                        (
                            str(payload.get("target_period") or ""),
                            str(payload.get("play_type") or "dlt"),
                            int(payload.get("multiplier") or 1),
                            1 if bool(payload.get("is_append")) else 0,
                            int(payload.get("bet_count") or 0),
                            int(payload.get("amount") or 0),
                            int(payload.get("discount_amount") or 0),
                            current_time,
                            record_id,
                            user_id,
                        ),
                    )
                    if cursor.rowcount <= 0:
                        cursor.execute(
                            """
                            SELECT id
                            FROM my_bet_record
                            WHERE id = ? AND user_id = ?
                            LIMIT 1
                            """,
                            (record_id, user_id),
                        )
                        if cursor.fetchone() is None:
                            return None
                    self._replace_lines(cursor, record_id=record_id, lottery_code=lottery_code, lines=payload.get("lines"))
                    self._upsert_meta(cursor, record_id=record_id, lottery_code=lottery_code, payload=payload)
        return self.get_record(record_id, user_id, lottery_code=lottery_code)

    def get_record(self, record_id: int, user_id: int, lottery_code: str = "dlt") -> dict[str, Any] | None:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            record.id,
                            record.user_id,
                            record.target_period,
                            record.play_type,
                            record.multiplier,
                            record.is_append,
                            record.bet_count,
                            record.amount,
                            record.discount_amount,
                            record.created_at,
                            record.updated_at,
                            meta.source_type,
                            meta.ticket_image_url,
                            meta.ocr_text,
                            meta.ocr_provider,
                            meta.ocr_recognized_at,
                            meta.ticket_purchased_at
                        FROM my_bet_record AS record
                        LEFT JOIN my_bet_record_meta AS meta ON meta.record_id = record.id
                        WHERE record.id = ? AND record.user_id = ?
                        LIMIT 1
                        """,
                        (record_id, user_id),
                    )
                    record = cursor.fetchone()
                    if not record:
                        return None
                    line_map = self._list_lines_map(cursor, [record_id])
                    return self._compose_record_payload(record, line_map.get(record_id, []), lottery_code=lottery_code)

    def list_records_by_period(self, target_period: str, lottery_code: str = "dlt") -> list[dict[str, Any]]:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            record.id,
                            record.user_id,
                            record.target_period,
                            record.play_type,
                            record.multiplier,
                            record.is_append,
                            record.bet_count,
                            record.amount,
                            record.discount_amount,
                            record.created_at,
                            record.updated_at,
                            meta.source_type,
                            meta.ticket_image_url,
                            meta.ocr_text,
                            meta.ocr_provider,
                            meta.ocr_recognized_at,
                            meta.ticket_purchased_at
                        FROM my_bet_record AS record
                        LEFT JOIN my_bet_record_meta AS meta ON meta.record_id = record.id
                        WHERE record.target_period = ?
                        ORDER BY record.created_at DESC, record.id DESC
                        """,
                        (str(target_period or ""),),
                    )
                    records = cursor.fetchall()
                    line_map = self._list_lines_map(cursor, [int(item["id"]) for item in records])
                    return [
                        self._compose_record_payload(item, line_map.get(int(item["id"]), []), lottery_code=lottery_code)
                        for item in records
                    ]

    def delete_record(self, record_id: int, user_id: int, lottery_code: str = "dlt") -> bool:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM my_bet_record WHERE id = ? AND user_id = ?",
                        (record_id, user_id),
                    )
                    return cursor.rowcount > 0

    @staticmethod
    def _replace_lines(cursor: Any, *, record_id: int, lottery_code: str, lines: Any) -> None:
        cursor.execute("DELETE FROM my_bet_record_line WHERE record_id = ?", (record_id,))
        if not isinstance(lines, list):
            return
        for index, line in enumerate(lines, start=1):
            if not isinstance(line, dict):
                continue
            cursor.execute(
                """
                INSERT INTO my_bet_record_line (
                    record_id,
                    line_no,
                    play_type,
                    multiplier,
                    is_append,
                    bet_count,
                    amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    index,
                    str(line.get("play_type") or "dlt"),
                    int(line.get("multiplier") or 1),
                    1 if bool(line.get("is_append")) else 0,
                    int(line.get("bet_count") or 0),
                    int(line.get("amount") or 0),
                ),
            )
            line_id = int(cursor.lastrowid)
            MyBetRepository._replace_line_numbers(cursor, line_id=line_id, line=line)

    @staticmethod
    def _upsert_meta(cursor: Any, *, record_id: int, lottery_code: str, payload: dict[str, Any]) -> None:
        source_type = str(payload.get("source_type") or "manual").strip().lower() or "manual"
        if source_type not in {"manual", "ocr"}:
            source_type = "manual"
        storage_mode = MyBetRepository._resolve_meta_time_storage_mode(cursor)
        cursor.execute(
            """
            INSERT INTO my_bet_record_meta (
                record_id,
                source_type,
                ticket_image_url,
                ocr_text,
                ocr_provider,
                ocr_recognized_at,
                ticket_purchased_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                source_type = VALUES(source_type),
                ticket_image_url = VALUES(ticket_image_url),
                ocr_text = VALUES(ocr_text),
                ocr_provider = VALUES(ocr_provider),
                ocr_recognized_at = VALUES(ocr_recognized_at),
                ticket_purchased_at = VALUES(ticket_purchased_at)
            """,
            (
                record_id,
                source_type,
                str(payload.get("ticket_image_url") or "") or None,
                str(payload.get("ocr_text") or "") or None,
                str(payload.get("ocr_provider") or "") or None,
                MyBetRepository._normalize_meta_time_value(payload.get("ocr_recognized_at"), storage_mode=storage_mode),
                MyBetRepository._normalize_meta_time_value(payload.get("ticket_purchased_at"), storage_mode=storage_mode),
            ),
        )

    @staticmethod
    def _list_lines_map(cursor: Any, record_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
        if not record_ids:
            return {}
        placeholders = ", ".join(["?"] * len(record_ids))
        cursor.execute(
            f"""
            SELECT
                id,
                record_id,
                line_no,
                play_type,
                multiplier,
                is_append,
                bet_count,
                amount
            FROM my_bet_record_line
            WHERE record_id IN ({placeholders})
            ORDER BY record_id ASC, line_no ASC
            """,
            tuple(record_ids),
        )
        line_map: dict[int, list[dict[str, Any]]] = {}
        rows = cursor.fetchall()
        line_ids = [int(row["id"]) for row in rows if row.get("id") is not None]
        line_numbers_map = MyBetRepository._load_line_numbers_map(cursor, line_ids)
        for row in rows:
            record_id = int(row.get("record_id") or 0)
            row.update(with_number_fields(line_numbers_map.get(int(row.get("id") or 0))))
            line_map.setdefault(record_id, []).append(row)
        return line_map

    @staticmethod
    def _compose_record_payload(record: dict[str, Any], lines: list[dict[str, Any]], *, lottery_code: str) -> dict[str, Any]:
        primary_line = lines[0] if lines else {}
        primary_numbers = with_number_fields(
            {field_name: primary_line.get(field_name) for field_name in EMPTY_NUMBER_FIELDS}
        )
        return {
            **record,
            **primary_numbers,
            "lottery_code": lottery_code,
            "lines": lines,
        }

    @staticmethod
    def _replace_line_numbers(cursor: Any, *, line_id: int, line: dict[str, Any]) -> None:
        cursor.execute("DELETE FROM my_bet_record_line_number WHERE line_id = ?", (line_id,))
        for number_role, number_position, number_value in build_number_rows(line):
            cursor.execute(
                """
                INSERT INTO my_bet_record_line_number (line_id, number_role, number_position, number_value)
                VALUES (?, ?, ?, ?)
                """,
                (line_id, number_role, number_position, number_value),
            )

    @staticmethod
    def _load_line_numbers_map(cursor: Any, line_ids: list[int]) -> dict[int, dict[str, str]]:
        if not line_ids:
            return {}
        placeholders = ", ".join(["?"] * len(line_ids))
        cursor.execute(
            f"""
            SELECT line_id, number_role, number_position, number_value
            FROM my_bet_record_line_number
            WHERE line_id IN ({placeholders})
            ORDER BY line_id ASC, number_role ASC, number_position ASC
            """,
            tuple(line_ids),
        )
        grouped: dict[int, list[dict[str, Any]]] = {}
        for row in cursor.fetchall():
            grouped.setdefault(int(row["line_id"]), []).append(row)
        return {line_id: merge_number_rows(rows) for line_id, rows in grouped.items()}

    @staticmethod
    def _normalize_datetime_value(value: Any) -> str | None:
        timestamp = ensure_timestamp(value, assume_beijing=True)
        if timestamp is None:
            return None
        return format_beijing_datetime(timestamp, with_seconds=True)

    @staticmethod
    def _normalize_record_time_value(value: Any, *, storage_mode: str) -> int | str | None:
        timestamp = ensure_timestamp(value, assume_beijing=True)
        if timestamp is None:
            return None
        if storage_mode == "epoch":
            return int(timestamp)
        return format_beijing_datetime(timestamp, with_seconds=True)

    @staticmethod
    def _normalize_meta_time_value(value: Any, *, storage_mode: str) -> int | str | None:
        timestamp = ensure_timestamp(value, assume_beijing=True)
        if timestamp is None:
            return None
        if storage_mode == "epoch":
            return int(timestamp)
        return format_beijing_datetime(timestamp, with_seconds=True)

    @classmethod
    def _resolve_record_time_storage_mode(cls, cursor: Any) -> str:
        try:
            cursor.execute("SHOW COLUMNS FROM my_bet_record LIKE 'created_at'")
            row = cursor.fetchone() or {}
            column_type = str((row.get("Type") if isinstance(row, dict) else "") or "").strip().lower()
            cls._record_time_storage_mode = "epoch" if "int" in column_type else "datetime"
        except Exception:
            cls._record_time_storage_mode = "datetime"
        return cls._record_time_storage_mode

    @classmethod
    def _resolve_meta_time_storage_mode(cls, cursor: Any) -> str:
        try:
            cursor.execute("SHOW COLUMNS FROM my_bet_record_meta LIKE 'ticket_purchased_at'")
            row = cursor.fetchone() or {}
            column_type = str((row.get("Type") if isinstance(row, dict) else "") or "").strip().lower()
            cls._meta_time_storage_mode = "epoch" if "int" in column_type else "datetime"
        except Exception:
            cls._meta_time_storage_mode = "datetime"
        return cls._meta_time_storage_mode
