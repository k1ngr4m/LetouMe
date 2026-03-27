from __future__ import annotations

from datetime import datetime
from math import comb
from typing import Any

from backend.app.lotteries import normalize_lottery_code
from backend.app.repositories.simulation_ticket_repository import SimulationTicketRepository


class SimulationTicketService:
    FRONT_RANGE = range(1, 36)
    BACK_RANGE = range(1, 13)
    DIGIT_RANGE = range(0, 10)

    def __init__(self, repository: SimulationTicketRepository | None = None) -> None:
        self.repository = repository or SimulationTicketRepository()

    def list_tickets(self, user_id: int, lottery_code: str = "dlt") -> list[dict[str, Any]]:
        normalized_code = normalize_lottery_code(lottery_code)
        return [self._serialize_ticket(ticket) for ticket in self.repository.list_tickets(user_id, lottery_code=normalized_code)]

    def create_ticket(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        lottery_code = normalize_lottery_code(payload.get("lottery_code"))
        if lottery_code == "dlt":
            ticket_payload = self._build_dlt_ticket_payload(payload)
        elif lottery_code == "pl3":
            ticket_payload = self._build_pl3_ticket_payload(payload)
        else:
            ticket_payload = self._build_pl5_ticket_payload(payload)
        created = self.repository.create_ticket(user_id, {"lottery_code": lottery_code, **ticket_payload})
        return self._serialize_ticket(created)

    def quote_ticket(self, payload: dict[str, Any]) -> dict[str, Any]:
        lottery_code = normalize_lottery_code(payload.get("lottery_code"))
        requested_play_type = str(payload.get("play_type") or ("dlt" if lottery_code == "dlt" else "direct")).strip().lower() or ("dlt" if lottery_code == "dlt" else "direct")
        try:
            if lottery_code == "dlt":
                ticket_payload = self._build_dlt_ticket_payload(payload)
            elif lottery_code == "pl3":
                ticket_payload = self._build_pl3_ticket_payload(payload)
            else:
                ticket_payload = self._build_pl5_ticket_payload(payload)
        except ValueError:
            return {
                "lottery_code": lottery_code,
                "play_type": requested_play_type,
                "bet_count": 0,
                "amount": 0,
            }
        return {
            "lottery_code": lottery_code,
            "play_type": str(ticket_payload.get("play_type") or "dlt"),
            "bet_count": int(ticket_payload.get("bet_count") or 0),
            "amount": int(ticket_payload.get("amount") or 0),
        }

    def delete_ticket(self, user_id: int, ticket_id: int, lottery_code: str = "dlt") -> None:
        deleted = self.repository.delete_ticket(ticket_id, user_id, lottery_code=normalize_lottery_code(lottery_code))
        if not deleted:
            raise KeyError(ticket_id)

    def _normalize_dlt_numbers(self, values: Any, *, zone: str) -> list[str]:
        if not isinstance(values, list):
            raise ValueError("号码格式不正确")
        normalized = sorted({str(item).zfill(2) for item in values})
        valid_range = self.FRONT_RANGE if zone == "front" else self.BACK_RANGE
        if any(not number.isdigit() or int(number) not in valid_range for number in normalized):
            raise ValueError("号码超出可选范围")
        return normalized

    def _normalize_pl3_numbers(self, values: Any) -> list[str]:
        if not isinstance(values, list):
            raise ValueError("号码格式不正确")
        normalized = sorted({str(item).zfill(2) for item in values})
        if any(not number.isdigit() or int(number) not in self.DIGIT_RANGE for number in normalized):
            raise ValueError("号码超出可选范围")
        return normalized

    def _build_dlt_ticket_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        play_type = str(payload.get("play_type") or "dlt").strip().lower() or "dlt"
        if play_type == "dlt_dantuo":
            return self._build_dlt_dantuo_ticket_payload(payload)
        if play_type != "dlt":
            raise ValueError("大乐透玩法仅支持 dlt / dlt_dantuo")

        front_numbers = self._normalize_dlt_numbers(payload.get("front_numbers"), zone="front")
        back_numbers = self._normalize_dlt_numbers(payload.get("back_numbers"), zone="back")
        if len(front_numbers) < 5:
            raise ValueError("前区至少选择 5 个号码")
        if len(back_numbers) < 2:
            raise ValueError("后区至少选择 2 个号码")
        bet_count = comb(len(front_numbers), 5) * comb(len(back_numbers), 2)
        return {
            "play_type": "dlt",
            "front_numbers": ",".join(front_numbers),
            "back_numbers": ",".join(back_numbers),
            "front_dan": None,
            "front_tuo": None,
            "back_dan": None,
            "back_tuo": None,
            "direct_hundreds": None,
            "direct_tens": None,
            "direct_units": None,
            "direct_ten_thousands": None,
            "direct_thousands": None,
            "group_numbers": None,
            "bet_count": bet_count,
            "amount": bet_count * 2,
        }

    def _build_dlt_dantuo_ticket_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        front_dan = self._normalize_dlt_numbers(payload.get("front_dan"), zone="front")
        front_tuo = self._normalize_dlt_numbers(payload.get("front_tuo"), zone="front")
        back_dan = self._normalize_dlt_numbers(payload.get("back_dan", []), zone="back")
        back_tuo = self._normalize_dlt_numbers(payload.get("back_tuo"), zone="back")
        if len(front_dan) < 1 or len(front_dan) > 4:
            raise ValueError("前区胆码数量应为 1-4")
        if len(front_tuo) < 2:
            raise ValueError("前区拖码至少选择 2 个号码")
        if len(set(front_dan) & set(front_tuo)) > 0:
            raise ValueError("前区胆码与拖码不可重复")
        if len(set([*front_dan, *front_tuo])) < 6:
            raise ValueError("前区胆码与拖码合计至少 6 个号码")
        if len(back_dan) > 1:
            raise ValueError("后区胆码最多 1 个")
        if len(back_tuo) < 2:
            raise ValueError("后区拖码至少选择 2 个号码")
        if len(set(back_dan) & set(back_tuo)) > 0:
            raise ValueError("后区胆码与拖码不可重复")
        if len(set([*back_dan, *back_tuo])) < 3:
            raise ValueError("后区胆码与拖码合计至少 3 个号码")
        front_pick_count = 5 - len(front_dan)
        back_pick_count = 2 - len(back_dan)
        if len(front_tuo) < front_pick_count or len(back_tuo) < back_pick_count:
            raise ValueError("拖码数量不足以组成有效注单")
        bet_count = comb(len(front_tuo), front_pick_count) * comb(len(back_tuo), back_pick_count)
        return {
            "play_type": "dlt_dantuo",
            "front_numbers": "",
            "back_numbers": "",
            "front_dan": ",".join(front_dan),
            "front_tuo": ",".join(front_tuo),
            "back_dan": ",".join(back_dan),
            "back_tuo": ",".join(back_tuo),
            "direct_hundreds": None,
            "direct_tens": None,
            "direct_units": None,
            "direct_ten_thousands": None,
            "direct_thousands": None,
            "group_numbers": None,
            "bet_count": bet_count,
            "amount": bet_count * 2,
        }

    def _build_pl3_ticket_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        play_type = str(payload.get("play_type") or "").strip().lower()
        if play_type not in {"direct", "group3", "group6"}:
            raise ValueError("排列3玩法仅支持 direct / group3 / group6")

        if play_type == "direct":
            hundreds = self._normalize_pl3_numbers(payload.get("direct_hundreds"))
            tens = self._normalize_pl3_numbers(payload.get("direct_tens"))
            units = self._normalize_pl3_numbers(payload.get("direct_units"))
            if not hundreds or not tens or not units:
                raise ValueError("直选需为百位、十位、个位各选择至少 1 个号码")
            bet_count = len(hundreds) * len(tens) * len(units)
            return {
                "play_type": "direct",
                "front_numbers": "",
                "back_numbers": "",
                "direct_ten_thousands": None,
                "direct_thousands": None,
                "direct_hundreds": ",".join(hundreds),
                "direct_tens": ",".join(tens),
                "direct_units": ",".join(units),
                "group_numbers": None,
                "bet_count": bet_count,
                "amount": bet_count * 2,
            }

        group_numbers = self._normalize_pl3_numbers(payload.get("group_numbers"))
        min_count = 2 if play_type == "group3" else 3
        if len(group_numbers) < min_count:
            raise ValueError("组选号码数量不足")
        bet_count = len(group_numbers) * (len(group_numbers) - 1) if play_type == "group3" else comb(len(group_numbers), 3)
        return {
            "play_type": play_type,
            "front_numbers": "",
            "back_numbers": "",
            "direct_ten_thousands": None,
            "direct_thousands": None,
            "direct_hundreds": None,
            "direct_tens": None,
            "direct_units": None,
            "group_numbers": ",".join(group_numbers),
            "bet_count": bet_count,
            "amount": bet_count * 2,
        }

    def _build_pl5_ticket_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        play_type = str(payload.get("play_type") or "").strip().lower()
        if play_type != "direct":
            raise ValueError("排列5玩法仅支持 direct")
        ten_thousands = self._normalize_pl3_numbers(payload.get("direct_ten_thousands"))
        thousands = self._normalize_pl3_numbers(payload.get("direct_thousands"))
        hundreds = self._normalize_pl3_numbers(payload.get("direct_hundreds"))
        tens = self._normalize_pl3_numbers(payload.get("direct_tens"))
        units = self._normalize_pl3_numbers(payload.get("direct_units"))
        if not ten_thousands or not thousands or not hundreds or not tens or not units:
            raise ValueError("直选需为万位、千位、百位、十位、个位各选择至少 1 个号码")
        bet_count = len(ten_thousands) * len(thousands) * len(hundreds) * len(tens) * len(units)
        return {
            "play_type": "direct",
            "front_numbers": "",
            "back_numbers": "",
            "direct_ten_thousands": ",".join(ten_thousands),
            "direct_thousands": ",".join(thousands),
            "direct_hundreds": ",".join(hundreds),
            "direct_tens": ",".join(tens),
            "direct_units": ",".join(units),
            "group_numbers": None,
            "bet_count": bet_count,
            "amount": bet_count * 2,
        }

    @staticmethod
    def _serialize_ticket(ticket: dict[str, Any]) -> dict[str, Any]:
        created_at = ticket.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.strftime("%Y-%m-%dT%H:%M:%SZ")
        return {
            "id": int(ticket.get("id") or 0),
            "lottery_code": str(ticket.get("lottery_code") or "dlt"),
            "play_type": str(ticket.get("play_type") or "dlt"),
            "front_numbers": [item for item in str(ticket.get("front_numbers") or "").split(",") if item],
            "back_numbers": [item for item in str(ticket.get("back_numbers") or "").split(",") if item],
            "front_dan": [item for item in str(ticket.get("front_dan") or "").split(",") if item],
            "front_tuo": [item for item in str(ticket.get("front_tuo") or "").split(",") if item],
            "back_dan": [item for item in str(ticket.get("back_dan") or "").split(",") if item],
            "back_tuo": [item for item in str(ticket.get("back_tuo") or "").split(",") if item],
            "direct_ten_thousands": [item for item in str(ticket.get("direct_ten_thousands") or "").split(",") if item],
            "direct_thousands": [item for item in str(ticket.get("direct_thousands") or "").split(",") if item],
            "direct_hundreds": [item for item in str(ticket.get("direct_hundreds") or "").split(",") if item],
            "direct_tens": [item for item in str(ticket.get("direct_tens") or "").split(",") if item],
            "direct_units": [item for item in str(ticket.get("direct_units") or "").split(",") if item],
            "group_numbers": [item for item in str(ticket.get("group_numbers") or "").split(",") if item],
            "bet_count": int(ticket.get("bet_count") or 0),
            "amount": int(ticket.get("amount") or 0),
            "created_at": created_at or "",
        }
