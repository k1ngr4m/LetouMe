from __future__ import annotations

from typing import Any

from backend.app.db.connection import get_connection
from backend.app.db.lottery_tables import use_lottery_table_scope
from backend.app.number_codec import EMPTY_NUMBER_FIELDS, build_number_rows, with_number_fields, merge_number_rows


class MyBetRepository:
    def list_records(self, user_id: int, lottery_code: str = "dlt") -> list[dict[str, Any]]:
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
                        WHERE record.user_id = ?
                        ORDER BY record.target_period DESC, record.created_at DESC, record.id DESC
                        """,
                        (user_id,),
                    )
                    records = cursor.fetchall()
                    line_map = self._list_lines_map(cursor, [int(item["id"]) for item in records])
                    return [
                        self._compose_record_payload(item, line_map.get(int(item["id"]), []), lottery_code=lottery_code)
                        for item in records
                    ]

    def create_record(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        lottery_code = str(payload.get("lottery_code") or "dlt")
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO my_bet_record (
                            user_id,
                            target_period,
                            play_type,
                            multiplier,
                            is_append,
                            bet_count,
                            amount
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            user_id,
                            str(payload.get("target_period") or ""),
                            str(payload.get("play_type") or "dlt"),
                            int(payload.get("multiplier") or 1),
                            1 if bool(payload.get("is_append")) else 0,
                            int(payload.get("bet_count") or 0),
                            int(payload.get("amount") or 0),
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
                    cursor.execute(
                        """
                        UPDATE my_bet_record
                        SET
                            target_period = ?,
                            play_type = ?,
                            multiplier = ?,
                            is_append = ?,
                            bet_count = ?,
                            amount = ?
                        WHERE id = ? AND user_id = ?
                        """,
                        (
                            str(payload.get("target_period") or ""),
                            str(payload.get("play_type") or "dlt"),
                            int(payload.get("multiplier") or 1),
                            1 if bool(payload.get("is_append")) else 0,
                            int(payload.get("bet_count") or 0),
                            int(payload.get("amount") or 0),
                            record_id,
                            user_id,
                        ),
                    )
                    if cursor.rowcount <= 0:
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
                MyBetRepository._normalize_datetime_value(payload.get("ocr_recognized_at")),
                MyBetRepository._normalize_datetime_value(payload.get("ticket_purchased_at")),
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
        text = str(value or "").strip()
        if not text:
            return None
        normalized = text.replace("T", " ").replace("Z", "")
        return normalized[:19]
