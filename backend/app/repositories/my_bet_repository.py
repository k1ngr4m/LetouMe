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
                            id,
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
                            amount,
                            created_at,
                            updated_at
                        FROM my_bet_record
                        WHERE user_id = ? AND lottery_code = ?
                        ORDER BY target_period DESC, created_at DESC, id DESC
                        """,
                        (user_id, lottery_code),
                    )
                    return cursor.fetchall()

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
        return self.get_record(record_id, user_id, lottery_code=lottery_code)

    def get_record(self, record_id: int, user_id: int, lottery_code: str = "dlt") -> dict[str, Any] | None:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            id,
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
                            amount,
                            created_at,
                            updated_at
                        FROM my_bet_record
                        WHERE id = ? AND user_id = ? AND lottery_code = ?
                        LIMIT 1
                        """,
                        (record_id, user_id, lottery_code),
                    )
                    return cursor.fetchone()

    def delete_record(self, record_id: int, user_id: int, lottery_code: str = "dlt") -> bool:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM my_bet_record WHERE id = ? AND user_id = ? AND lottery_code = ?",
                        (record_id, user_id, lottery_code),
                    )
                    return cursor.rowcount > 0
