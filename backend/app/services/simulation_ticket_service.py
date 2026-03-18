from __future__ import annotations

from datetime import datetime
from math import comb
from typing import Any

from backend.app.repositories.simulation_ticket_repository import SimulationTicketRepository


class SimulationTicketService:
    FRONT_RANGE = range(1, 36)
    BACK_RANGE = range(1, 13)

    def __init__(self, repository: SimulationTicketRepository | None = None) -> None:
        self.repository = repository or SimulationTicketRepository()

    def list_tickets(self, user_id: int) -> list[dict[str, Any]]:
        return [self._serialize_ticket(ticket) for ticket in self.repository.list_tickets(user_id)]

    def create_ticket(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        front_numbers = self._normalize_numbers(payload.get("front_numbers"), zone="front")
        back_numbers = self._normalize_numbers(payload.get("back_numbers"), zone="back")
        if len(front_numbers) < 5:
            raise ValueError("前区至少选择 5 个号码")
        if len(back_numbers) < 2:
            raise ValueError("后区至少选择 2 个号码")

        bet_count = comb(len(front_numbers), 5) * comb(len(back_numbers), 2)
        amount = bet_count * 2
        created = self.repository.create_ticket(
            user_id,
            {
                "front_numbers": ",".join(front_numbers),
                "back_numbers": ",".join(back_numbers),
                "bet_count": bet_count,
                "amount": amount,
            },
        )
        return self._serialize_ticket(created)

    def delete_ticket(self, user_id: int, ticket_id: int) -> None:
        deleted = self.repository.delete_ticket(ticket_id, user_id)
        if not deleted:
            raise KeyError(ticket_id)

    def _normalize_numbers(self, values: Any, *, zone: str) -> list[str]:
        if not isinstance(values, list):
            raise ValueError("号码格式不正确")
        normalized = sorted({str(item).zfill(2) for item in values})
        valid_range = self.FRONT_RANGE if zone == "front" else self.BACK_RANGE
        if any(not number.isdigit() or int(number) not in valid_range for number in normalized):
            raise ValueError("号码超出可选范围")
        return normalized

    @staticmethod
    def _serialize_ticket(ticket: dict[str, Any]) -> dict[str, Any]:
        created_at = ticket.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.strftime("%Y-%m-%dT%H:%M:%SZ")
        return {
            "id": int(ticket.get("id") or 0),
            "front_numbers": [item for item in str(ticket.get("front_numbers") or "").split(",") if item],
            "back_numbers": [item for item in str(ticket.get("back_numbers") or "").split(",") if item],
            "bet_count": int(ticket.get("bet_count") or 0),
            "amount": int(ticket.get("amount") or 0),
            "created_at": created_at or "",
        }
