from __future__ import annotations

from typing import Any

from backend.app.db.connection import get_connection
from backend.app.db.lottery_tables import use_lottery_table_scope
from backend.app.number_codec import build_number_rows, with_number_fields, merge_number_rows


class SimulationTicketRepository:
    def list_tickets(self, user_id: int, lottery_code: str = "dlt") -> list[dict[str, Any]]:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            id,
                            user_id,
                            play_type,
                            bet_count,
                            amount,
                            created_at
                        FROM simulation_ticket
                        WHERE user_id = ?
                        ORDER BY created_at DESC, id DESC
                        """,
                        (user_id,),
                    )
                    rows = cursor.fetchall()
                    ticket_numbers = self._load_ticket_numbers(cursor, [int(row["id"]) for row in rows])
                    for row in rows:
                        row.update(with_number_fields(ticket_numbers.get(int(row["id"]))))
                        row["lottery_code"] = lottery_code
                    return rows

    def create_ticket(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        lottery_code = str(payload.get("lottery_code", "dlt"))
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO simulation_ticket (
                            user_id,
                            play_type,
                            bet_count,
                            amount
                        ) VALUES (?, ?, ?, ?)
                        """,
                        (
                            user_id,
                            payload.get("play_type", "dlt"),
                            int(payload["bet_count"]),
                            int(payload["amount"]),
                        ),
                    )
                    ticket_id = int(cursor.lastrowid)
                    self._replace_ticket_numbers(cursor, ticket_id=ticket_id, payload=payload)
        return self.get_ticket(ticket_id, user_id, lottery_code=lottery_code) or {}

    def get_ticket(self, ticket_id: int, user_id: int, lottery_code: str = "dlt") -> dict[str, Any] | None:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            id,
                            user_id,
                            play_type,
                            bet_count,
                            amount,
                            created_at
                        FROM simulation_ticket
                        WHERE id = ? AND user_id = ?
                        LIMIT 1
                        """,
                        (ticket_id, user_id),
                    )
                    row = cursor.fetchone()
                    if not row:
                        return None
                    row.update(with_number_fields(self._load_ticket_numbers(cursor, [int(row["id"])]).get(int(row["id"]))))
                    row["lottery_code"] = lottery_code
                    return row

    def delete_ticket(self, ticket_id: int, user_id: int, lottery_code: str = "dlt") -> bool:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM simulation_ticket WHERE id = ? AND user_id = ?",
                        (ticket_id, user_id),
                    )
                    return cursor.rowcount > 0

    @staticmethod
    def _replace_ticket_numbers(cursor, *, ticket_id: int, payload: dict[str, Any]) -> None:
        cursor.execute("DELETE FROM simulation_ticket_number WHERE ticket_id = ?", (ticket_id,))
        for number_role, number_position, number_value in build_number_rows(payload):
            cursor.execute(
                """
                INSERT INTO simulation_ticket_number (ticket_id, number_role, number_position, number_value)
                VALUES (?, ?, ?, ?)
                """,
                (ticket_id, number_role, number_position, number_value),
            )

    @staticmethod
    def _load_ticket_numbers(cursor, ticket_ids: list[int]) -> dict[int, dict[str, str]]:
        if not ticket_ids:
            return {}
        placeholders = ", ".join("?" for _ in ticket_ids)
        cursor.execute(
            f"""
            SELECT ticket_id, number_role, number_position, number_value
            FROM simulation_ticket_number
            WHERE ticket_id IN ({placeholders})
            ORDER BY ticket_id ASC, number_role ASC, number_position ASC
            """,
            tuple(ticket_ids),
        )
        grouped: dict[int, list[dict[str, Any]]] = {}
        for row in cursor.fetchall():
            grouped.setdefault(int(row["ticket_id"]), []).append(row)
        return {ticket_id: merge_number_rows(rows) for ticket_id, rows in grouped.items()}
