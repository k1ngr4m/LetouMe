from __future__ import annotations

from typing import Any

from backend.app.db.connection import get_connection


class SimulationTicketRepository:
    def list_tickets(self, user_id: int) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, user_id, front_numbers, back_numbers, bet_count, amount, created_at
                    FROM simulation_ticket
                    WHERE user_id = ?
                    ORDER BY created_at DESC, id DESC
                    """,
                    (user_id,),
                )
                return cursor.fetchall()

    def create_ticket(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO simulation_ticket (user_id, front_numbers, back_numbers, bet_count, amount)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        payload["front_numbers"],
                        payload["back_numbers"],
                        int(payload["bet_count"]),
                        int(payload["amount"]),
                    ),
                )
                ticket_id = int(cursor.lastrowid)
        return self.get_ticket(ticket_id, user_id) or {}

    def get_ticket(self, ticket_id: int, user_id: int) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, user_id, front_numbers, back_numbers, bet_count, amount, created_at
                    FROM simulation_ticket
                    WHERE id = ? AND user_id = ?
                    LIMIT 1
                    """,
                    (ticket_id, user_id),
                )
                return cursor.fetchone()

    def delete_ticket(self, ticket_id: int, user_id: int) -> bool:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM simulation_ticket WHERE id = ? AND user_id = ?",
                    (ticket_id, user_id),
                )
                return cursor.rowcount > 0
