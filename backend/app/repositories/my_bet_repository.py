from __future__ import annotations

from typing import Any

from backend.app.db.connection import get_connection
from backend.app.db.lottery_tables import use_lottery_table_scope


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
                            record.lottery_code,
                            record.target_period,
                            record.play_type,
                            record.front_numbers,
                            record.back_numbers,
                            record.direct_hundreds,
                            record.direct_tens,
                            record.direct_units,
                            record.group_numbers,
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
                            meta.ocr_recognized_at
                        FROM my_bet_record AS record
                        LEFT JOIN my_bet_record_meta AS meta ON meta.record_id = record.id
                        WHERE record.user_id = ? AND record.lottery_code = ?
                        ORDER BY record.target_period DESC, record.created_at DESC, record.id DESC
                        """,
                        (user_id, lottery_code),
                    )
                    records = cursor.fetchall()
                    line_map = self._list_lines_map(cursor, [int(item["id"]) for item in records])
                    return [{**item, "lines": line_map.get(int(item["id"]), [])} for item in records]

    def create_record(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        lottery_code = str(payload.get("lottery_code") or "dlt")
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO my_bet_record (
                            user_id,
                            lottery_code,
                            target_period,
                            play_type,
                            front_numbers,
                            back_numbers,
                            direct_hundreds,
                            direct_tens,
                            direct_units,
                            group_numbers,
                            multiplier,
                            is_append,
                            bet_count,
                            amount
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            user_id,
                            lottery_code,
                            str(payload.get("target_period") or ""),
                            str(payload.get("play_type") or "dlt"),
                            str(payload.get("front_numbers") or ""),
                            str(payload.get("back_numbers") or ""),
                            payload.get("direct_hundreds"),
                            payload.get("direct_tens"),
                            payload.get("direct_units"),
                            payload.get("group_numbers"),
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
                            front_numbers = ?,
                            back_numbers = ?,
                            direct_hundreds = ?,
                            direct_tens = ?,
                            direct_units = ?,
                            group_numbers = ?,
                            multiplier = ?,
                            is_append = ?,
                            bet_count = ?,
                            amount = ?
                        WHERE id = ? AND user_id = ? AND lottery_code = ?
                        """,
                        (
                            str(payload.get("target_period") or ""),
                            str(payload.get("play_type") or "dlt"),
                            str(payload.get("front_numbers") or ""),
                            str(payload.get("back_numbers") or ""),
                            payload.get("direct_hundreds"),
                            payload.get("direct_tens"),
                            payload.get("direct_units"),
                            payload.get("group_numbers"),
                            int(payload.get("multiplier") or 1),
                            1 if bool(payload.get("is_append")) else 0,
                            int(payload.get("bet_count") or 0),
                            int(payload.get("amount") or 0),
                            record_id,
                            user_id,
                            lottery_code,
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
                            record.lottery_code,
                            record.target_period,
                            record.play_type,
                            record.front_numbers,
                            record.back_numbers,
                            record.direct_hundreds,
                            record.direct_tens,
                            record.direct_units,
                            record.group_numbers,
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
                            meta.ocr_recognized_at
                        FROM my_bet_record AS record
                        LEFT JOIN my_bet_record_meta AS meta ON meta.record_id = record.id
                        WHERE record.id = ? AND record.user_id = ? AND record.lottery_code = ?
                        LIMIT 1
                        """,
                        (record_id, user_id, lottery_code),
                    )
                    record = cursor.fetchone()
                    if not record:
                        return None
                    line_map = self._list_lines_map(cursor, [record_id])
                    return {**record, "lines": line_map.get(record_id, [])}

    def delete_record(self, record_id: int, user_id: int, lottery_code: str = "dlt") -> bool:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM my_bet_record WHERE id = ? AND user_id = ? AND lottery_code = ?",
                        (record_id, user_id, lottery_code),
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
                    lottery_code,
                    line_no,
                    play_type,
                    front_numbers,
                    back_numbers,
                    direct_hundreds,
                    direct_tens,
                    direct_units,
                    group_numbers,
                    multiplier,
                    is_append,
                    bet_count,
                    amount
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    lottery_code,
                    index,
                    str(line.get("play_type") or "dlt"),
                    str(line.get("front_numbers") or ""),
                    str(line.get("back_numbers") or ""),
                    line.get("direct_hundreds"),
                    line.get("direct_tens"),
                    line.get("direct_units"),
                    line.get("group_numbers"),
                    int(line.get("multiplier") or 1),
                    1 if bool(line.get("is_append")) else 0,
                    int(line.get("bet_count") or 0),
                    int(line.get("amount") or 0),
                ),
            )

    @staticmethod
    def _upsert_meta(cursor: Any, *, record_id: int, lottery_code: str, payload: dict[str, Any]) -> None:
        source_type = str(payload.get("source_type") or "manual").strip().lower() or "manual"
        if source_type not in {"manual", "ocr"}:
            source_type = "manual"
        cursor.execute(
            """
            INSERT INTO my_bet_record_meta (
                record_id,
                lottery_code,
                source_type,
                ticket_image_url,
                ocr_text,
                ocr_provider,
                ocr_recognized_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                source_type = VALUES(source_type),
                ticket_image_url = VALUES(ticket_image_url),
                ocr_text = VALUES(ocr_text),
                ocr_provider = VALUES(ocr_provider),
                ocr_recognized_at = VALUES(ocr_recognized_at)
            """,
            (
                record_id,
                lottery_code,
                source_type,
                str(payload.get("ticket_image_url") or "") or None,
                str(payload.get("ocr_text") or "") or None,
                str(payload.get("ocr_provider") or "") or None,
                MyBetRepository._normalize_datetime_value(payload.get("ocr_recognized_at")),
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
                record_id,
                line_no,
                play_type,
                front_numbers,
                back_numbers,
                direct_hundreds,
                direct_tens,
                direct_units,
                group_numbers,
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
        for row in cursor.fetchall():
            record_id = int(row.get("record_id") or 0)
            line_map.setdefault(record_id, []).append(row)
        return line_map

    @staticmethod
    def _normalize_datetime_value(value: Any) -> str | None:
        text = str(value or "").strip()
        if not text:
            return None
        normalized = text.replace("T", " ").replace("Z", "")
        return normalized[:19]
