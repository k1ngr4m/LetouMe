from __future__ import annotations

from typing import Any

from backend.app.db.connection import get_connection
from backend.app.db.lottery_tables import use_lottery_table_scope


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
                            lottery_code,
                            play_type,
                            front_numbers,
                            back_numbers,
                            direct_ten_thousands,
                            direct_thousands,
                            direct_hundreds,
                            direct_tens,
                            direct_units,
                            group_numbers,
                            bet_count,
                            amount,
                            created_at
                        FROM simulation_ticket
                        WHERE user_id = ? AND lottery_code = ?
                        ORDER BY created_at DESC, id DESC
                        """,
                        (user_id, lottery_code),
                    )
                    return cursor.fetchall()

    def create_ticket(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        lottery_code = str(payload.get("lottery_code", "dlt"))
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO simulation_ticket (
                            user_id,
                            lottery_code,
                            play_type,
                            front_numbers,
                            back_numbers,
                            direct_ten_thousands,
                            direct_thousands,
                            direct_hundreds,
                            direct_tens,
                            direct_units,
                            group_numbers,
                            bet_count,
                            amount
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            user_id,
                            lottery_code,
                            payload.get("play_type", "dlt"),
                            payload["front_numbers"],
                            payload["back_numbers"],
                            payload.get("direct_ten_thousands"),
                            payload.get("direct_thousands"),
                            payload.get("direct_hundreds"),
                            payload.get("direct_tens"),
                            payload.get("direct_units"),
                            payload.get("group_numbers"),
                            int(payload["bet_count"]),
                            int(payload["amount"]),
                        ),
                    )
                    ticket_id = int(cursor.lastrowid)
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
                            lottery_code,
                            play_type,
                            front_numbers,
                            back_numbers,
                            direct_ten_thousands,
                            direct_thousands,
                            direct_hundreds,
                            direct_tens,
                            direct_units,
                            group_numbers,
                            bet_count,
                            amount,
                            created_at
                        FROM simulation_ticket
                        WHERE id = ? AND user_id = ?
                        LIMIT 1
                        """,
                        (ticket_id, user_id),
                    )
                    return cursor.fetchone()

    def delete_ticket(self, ticket_id: int, user_id: int, lottery_code: str = "dlt") -> bool:
        with use_lottery_table_scope(lottery_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM simulation_ticket WHERE id = ? AND user_id = ? AND lottery_code = ?",
                        (ticket_id, user_id, lottery_code),
                    )
                    return cursor.rowcount > 0
