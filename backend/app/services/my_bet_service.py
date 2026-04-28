from __future__ import annotations

import re
from datetime import datetime
from math import comb
from typing import Any
from zoneinfo import ZoneInfo

from backend.app.dlt_rules import (
    DLT_OLD_FIXED_PRIZE_RULES,
    dlt_prize_level_order,
    is_dlt_new_rule_period,
    resolve_dlt_fallback_prize_amount,
)
from backend.app.lotteries import normalize_digit_balls, normalize_lottery_code
from backend.app.repositories.lottery_repository import LotteryRepository
from backend.app.repositories.my_bet_repository import MyBetRepository
from backend.app.services.prediction_service import PredictionService
from backend.app.time_utils import ensure_timestamp, now_ts
from backend.app.services.ticket_ocr_service import TicketOCRService


def build_pl3_group_sum_bet_counts() -> dict[int, int]:
    counts = {sum_value: 0 for sum_value in range(28)}
    for first in range(10):
        for second in range(first, 10):
            for third in range(second, 10):
                if first == second == third:
                    continue
                counts[first + second + third] += 1
    return counts


class MyBetService:
    BEIJING_TIMEZONE = ZoneInfo("Asia/Shanghai")
    FRONT_RANGE = range(1, 36)
    BACK_RANGE = range(1, 13)
    DIGIT_RANGE = range(0, 10)
    QXC_LAST_RANGE = range(0, 15)
    DLT_FIXED_RULES = dict(DLT_OLD_FIXED_PRIZE_RULES)
    PL3_PRIZE_LEVEL_ORDER = ["直选", "和值", "组选3", "组选6"]
    PL3_DIRECT_SUM_BET_COUNTS = {
        int(sum_value): int(cost / 2) for sum_value, cost in PredictionService.PL3_DIRECT_SUM_COST_RULES.items()
    }
    PL3_GROUP_SUM_BET_COUNTS = build_pl3_group_sum_bet_counts()
    PL5_PRIZE_LEVEL_ORDER = ["直选"]
    QXC_PRIZE_LEVEL_ORDER = ["一等奖", "二等奖", "三等奖", "四等奖", "五等奖", "六等奖"]

    def __init__(
        self,
        repository: MyBetRepository | None = None,
        lottery_repository: LotteryRepository | None = None,
        ticket_ocr_service: TicketOCRService | None = None,
    ) -> None:
        self.repository = repository or MyBetRepository()
        self.lottery_repository = lottery_repository or LotteryRepository()
        self.ticket_ocr_service = ticket_ocr_service or TicketOCRService()

    def list_records(self, user_id: int, lottery_code: str = "dlt") -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        raw_records = self.repository.list_records(user_id, lottery_code=normalized_code)
        serialized_records = [self._serialize_record(item) for item in raw_records]
        target_periods = [
            str(item.get("target_period") or "")
            for item in serialized_records
            if str(item.get("target_period") or "").strip()
        ]
        draw_cache = self.lottery_repository.list_draws_by_periods(target_periods, lottery_code=normalized_code)
        previous_jackpot_cache = (
            self.lottery_repository.list_previous_jackpot_pool_by_periods(target_periods, lottery_code=normalized_code)
            if normalized_code == "dlt"
            else {}
        )
        records = [
            {
                **item,
                **self._calculate_settlement(
                    item,
                    lottery_code=normalized_code,
                    draw_cache=draw_cache,
                    previous_jackpot_cache=previous_jackpot_cache,
                ),
            }
            for item in serialized_records
        ]
        total_amount = sum(int(item.get("amount") or 0) for item in records)
        total_discount_amount = sum(int(item.get("discount_amount") or 0) for item in records)
        total_net_amount = sum(int(item.get("net_amount") or 0) for item in records)
        summary = {
            "total_count": len(records),
            "total_amount": total_amount,
            "total_discount_amount": total_discount_amount,
            "total_net_amount": total_net_amount,
            "total_prize_amount": sum(int(item.get("prize_amount") or 0) for item in records),
            "total_net_profit": sum(int(item.get("net_profit") or 0) for item in records),
            "settled_count": sum(1 for item in records if item.get("settlement_status") == "settled"),
            "pending_count": sum(1 for item in records if item.get("settlement_status") == "pending"),
        }
        return {"records": records, "summary": summary}

    def create_record(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(payload.get("lottery_code"))
        normalized_payload = self._build_payload(payload, lottery_code=normalized_code)
        created = self.repository.create_record(user_id, normalized_payload)
        return self._serialize_with_settlement(created, lottery_code=normalized_code)

    def update_record(self, user_id: int, record_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(payload.get("lottery_code"))
        normalized_payload = self._build_payload(payload, lottery_code=normalized_code)
        updated = self.repository.update_record(record_id, user_id, normalized_payload)
        if not updated:
            raise KeyError(record_id)
        return self._serialize_with_settlement(updated, lottery_code=normalized_code)

    def delete_record(self, user_id: int, record_id: int, lottery_code: str = "dlt") -> None:
        deleted = self.repository.delete_record(record_id, user_id, lottery_code=normalize_lottery_code(lottery_code))
        if not deleted:
            raise KeyError(record_id)

    def recognize_ticket_image(self, *, lottery_code: str, image_bytes: bytes, filename: str) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        draft = self.ticket_ocr_service.recognize(lottery_code=normalized_code, image_bytes=image_bytes, filename=filename)
        warnings = list(draft.get("warnings") or [])
        normalized_lines: list[dict[str, Any]] = []
        for line in draft.get("lines", []):
            try:
                normalized_lines.append(self._build_line_payload(line, lottery_code=normalized_code))
            except ValueError:
                warnings.append("部分识别号码格式异常，请手动修正")
        if not normalized_lines:
            normalized_lines = [self._build_empty_draft_line(lottery_code=normalized_code)]
        serialized_lines = [{**self._serialize_line(item), "line_no": index + 1} for index, item in enumerate(normalized_lines)]
        return {
            "lottery_code": normalized_code,
            "target_period": str(draft.get("target_period") or ""),
            "source_type": "ocr",
            "ticket_image_url": str(draft.get("ticket_image_url") or ""),
            "ocr_text": str(draft.get("ocr_text") or ""),
            "ocr_provider": str(draft.get("ocr_provider") or "baidu"),
            "ocr_recognized_at": int(ensure_timestamp(draft.get("ocr_recognized_at"), assume_beijing=True) or now_ts()),
            "ticket_purchased_at": ensure_timestamp(draft.get("ticket_purchased_at"), assume_beijing=True),
            "lines": serialized_lines,
            "warnings": warnings,
        }

    def upload_ticket_image(self, *, lottery_code: str, image_bytes: bytes, filename: str) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        return self.ticket_ocr_service.upload_image(lottery_code=normalized_code, image_bytes=image_bytes, filename=filename)

    def _build_payload(self, payload: dict[str, Any], *, lottery_code: str) -> dict[str, Any]:
        target_period = str(payload.get("target_period") or "").strip()
        if not target_period:
            raise ValueError("投注期号不能为空")
        if not target_period.isdigit():
            raise ValueError("投注期号格式不正确")

        built_lines = self._build_lines(payload, lottery_code=lottery_code)
        if not built_lines:
            raise ValueError("至少需要一条投注子注单")
        total_bet_count = sum(int(item.get("bet_count") or 0) for item in built_lines)
        total_amount = sum(int(item.get("amount") or 0) for item in built_lines)
        line_play_types = {str(item.get("play_type") or "dlt") for item in built_lines}
        primary_line = built_lines[0]
        summary_play_type = primary_line.get("play_type") if len(line_play_types) == 1 else "mixed"
        summary_multiplier = int(primary_line.get("multiplier") or 1) if len({int(item.get("multiplier") or 1) for item in built_lines}) == 1 else 1
        summary_is_append = bool(primary_line.get("is_append")) if len({bool(item.get("is_append")) for item in built_lines}) == 1 else False
        source_type = str(payload.get("source_type") or "manual").strip().lower() or "manual"
        if source_type not in {"manual", "ocr"}:
            source_type = "manual"
        discount_amount = int(payload.get("discount_amount") or 0)
        if discount_amount < 0:
            raise ValueError("优惠金额不能为负数")
        if discount_amount > total_amount:
            raise ValueError("优惠金额不能超过下注金额")

        return {
            "lottery_code": lottery_code,
            "target_period": target_period,
            "play_type": str(summary_play_type or "dlt"),
            "front_numbers": str(primary_line.get("front_numbers") or ""),
            "back_numbers": str(primary_line.get("back_numbers") or ""),
            "front_dan": primary_line.get("front_dan"),
            "front_tuo": primary_line.get("front_tuo"),
            "back_dan": primary_line.get("back_dan"),
            "back_tuo": primary_line.get("back_tuo"),
            "direct_ten_thousands": primary_line.get("direct_ten_thousands"),
            "direct_thousands": primary_line.get("direct_thousands"),
            "direct_hundreds": primary_line.get("direct_hundreds"),
            "direct_tens": primary_line.get("direct_tens"),
            "direct_units": primary_line.get("direct_units"),
            "group_numbers": primary_line.get("group_numbers"),
            "sum_values": primary_line.get("sum_values"),
            "multiplier": summary_multiplier,
            "is_append": summary_is_append,
            "bet_count": total_bet_count,
            "amount": total_amount,
            "discount_amount": discount_amount,
            "source_type": source_type,
            "ticket_image_url": str(payload.get("ticket_image_url") or ""),
            "ocr_text": str(payload.get("ocr_text") or ""),
            "ocr_provider": str(payload.get("ocr_provider") or "") or None,
            "ocr_recognized_at": ensure_timestamp(payload.get("ocr_recognized_at"), assume_beijing=True),
            "ticket_purchased_at": ensure_timestamp(payload.get("ticket_purchased_at"), assume_beijing=True),
            "lines": built_lines,
        }

    def _build_lines(self, payload: dict[str, Any], *, lottery_code: str) -> list[dict[str, Any]]:
        raw_lines = payload.get("lines")
        if isinstance(raw_lines, list) and raw_lines:
            return [self._build_line_payload(item, lottery_code=lottery_code) for item in raw_lines]
        return [self._build_legacy_line_payload(payload, lottery_code=lottery_code)]

    def _build_legacy_line_payload(self, payload: dict[str, Any], *, lottery_code: str) -> dict[str, Any]:
        if lottery_code == "dlt":
            return self._build_dlt_line_payload(payload, multiplier=int(payload.get("multiplier") or 1))
        if lottery_code == "pl3":
            return self._build_pl3_line_payload(payload, multiplier=int(payload.get("multiplier") or 1))
        if lottery_code == "pl5":
            return self._build_pl5_line_payload(payload, multiplier=int(payload.get("multiplier") or 1))
        return self._build_qxc_line_payload(payload, multiplier=int(payload.get("multiplier") or 1))

    def _build_line_payload(self, line: Any, *, lottery_code: str) -> dict[str, Any]:
        if not isinstance(line, dict):
            raise ValueError("投注子注单格式不正确")
        multiplier = int(line.get("multiplier") or 1)
        if multiplier < 1 or multiplier > 99:
            raise ValueError("倍投范围为 1-99")
        if lottery_code == "dlt":
            return self._build_dlt_line_payload(line, multiplier=multiplier)
        if lottery_code == "pl3":
            return self._build_pl3_line_payload(line, multiplier=multiplier)
        if lottery_code == "pl5":
            return self._build_pl5_line_payload(line, multiplier=multiplier)
        return self._build_qxc_line_payload(line, multiplier=multiplier)

    @staticmethod
    def _build_empty_draft_line(*, lottery_code: str) -> dict[str, Any]:
        if lottery_code == "dlt":
            return {
                "play_type": "dlt",
                "front_numbers": "",
                "back_numbers": "",
                "front_dan": None,
                "front_tuo": None,
                "back_dan": None,
                "back_tuo": None,
                "direct_ten_thousands": None,
                "direct_thousands": None,
                "direct_hundreds": None,
                "direct_tens": None,
                "direct_units": None,
                "group_numbers": None,
                "sum_values": None,
                "multiplier": 1,
                "is_append": False,
                "bet_count": 0,
                "amount": 0,
            }
        return {
            "play_type": "direct",
            "front_numbers": "",
            "back_numbers": "",
            "front_dan": None,
            "front_tuo": None,
            "back_dan": None,
            "back_tuo": None,
            "direct_ten_thousands": "",
            "direct_thousands": "",
            "direct_hundreds": "",
            "direct_tens": "",
            "direct_units": "",
            "group_numbers": None,
            "sum_values": None,
            "position_selections": [],
            "multiplier": 1,
            "is_append": False,
            "bet_count": 0,
            "amount": 0,
        }

    def _build_dlt_line_payload(self, payload: dict[str, Any], *, multiplier: int) -> dict[str, Any]:
        play_type = str(payload.get("play_type") or "dlt").strip().lower() or "dlt"
        if play_type == "dlt_dantuo":
            return self._build_dlt_dantuo_line_payload(payload, multiplier=multiplier)
        if play_type != "dlt":
            raise ValueError("大乐透玩法仅支持 dlt / dlt_dantuo")
        front_numbers = self._normalize_numbers(payload.get("front_numbers"), valid_range=self.FRONT_RANGE)
        back_numbers = self._normalize_numbers(payload.get("back_numbers"), valid_range=self.BACK_RANGE)
        if len(front_numbers) < 5:
            raise ValueError("前区至少选择 5 个号码")
        if len(back_numbers) < 2:
            raise ValueError("后区至少选择 2 个号码")
        bet_count = comb(len(front_numbers), 5) * comb(len(back_numbers), 2)
        is_append = bool(payload.get("is_append"))
        base_amount = bet_count * 2 * multiplier
        append_amount = bet_count * multiplier if is_append else 0
        return {
            "play_type": "dlt",
            "front_numbers": ",".join(front_numbers),
            "back_numbers": ",".join(back_numbers),
            "front_dan": None,
            "front_tuo": None,
            "back_dan": None,
            "back_tuo": None,
            "direct_ten_thousands": None,
            "direct_thousands": None,
            "direct_hundreds": None,
            "direct_tens": None,
            "direct_units": None,
            "group_numbers": None,
            "sum_values": None,
            "multiplier": multiplier,
            "is_append": is_append,
            "bet_count": bet_count,
            "amount": base_amount + append_amount,
        }

    def _build_dlt_dantuo_line_payload(self, payload: dict[str, Any], *, multiplier: int) -> dict[str, Any]:
        front_dan = self._normalize_numbers(payload.get("front_dan"), valid_range=self.FRONT_RANGE)
        front_tuo = self._normalize_numbers(payload.get("front_tuo"), valid_range=self.FRONT_RANGE)
        back_dan = self._normalize_numbers(payload.get("back_dan", []), valid_range=self.BACK_RANGE)
        back_tuo = self._normalize_numbers(payload.get("back_tuo"), valid_range=self.BACK_RANGE)
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
        is_append = bool(payload.get("is_append"))
        base_amount = bet_count * 2 * multiplier
        append_amount = bet_count * multiplier if is_append else 0
        return {
            "play_type": "dlt_dantuo",
            "front_numbers": "",
            "back_numbers": "",
            "front_dan": ",".join(front_dan),
            "front_tuo": ",".join(front_tuo),
            "back_dan": ",".join(back_dan),
            "back_tuo": ",".join(back_tuo),
            "direct_ten_thousands": None,
            "direct_thousands": None,
            "direct_hundreds": None,
            "direct_tens": None,
            "direct_units": None,
            "group_numbers": None,
            "sum_values": None,
            "multiplier": multiplier,
            "is_append": is_append,
            "bet_count": bet_count,
            "amount": base_amount + append_amount,
        }

    def _build_pl3_line_payload(self, payload: dict[str, Any], *, multiplier: int) -> dict[str, Any]:
        play_type = str(payload.get("play_type") or "").strip().lower()
        if play_type not in {"direct", "group3", "group6", "direct_sum", "group_sum", "pl3_dantuo"}:
            raise ValueError("排列3玩法仅支持 direct / group3 / group6 / direct_sum / group_sum / pl3_dantuo")
        if play_type == "direct":
            hundreds = self._normalize_numbers(payload.get("direct_hundreds"), valid_range=self.DIGIT_RANGE)
            tens = self._normalize_numbers(payload.get("direct_tens"), valid_range=self.DIGIT_RANGE)
            units = self._normalize_numbers(payload.get("direct_units"), valid_range=self.DIGIT_RANGE)
            if not hundreds or not tens or not units:
                raise ValueError("直选需为百位、十位、个位各选择至少 1 个号码")
            bet_count = len(hundreds) * len(tens) * len(units)
            return {
                "play_type": "direct",
                "front_numbers": "",
                "back_numbers": "",
                "front_dan": None,
                "front_tuo": None,
                "back_dan": None,
                "back_tuo": None,
                "direct_ten_thousands": None,
                "direct_thousands": None,
                "direct_hundreds": ",".join(hundreds),
                "direct_tens": ",".join(tens),
                "direct_units": ",".join(units),
                "group_numbers": None,
                "sum_values": None,
                "multiplier": multiplier,
                "is_append": False,
                "bet_count": bet_count,
                "amount": bet_count * 2 * multiplier,
            }
        if play_type == "pl3_dantuo":
            hundreds_dan, hundreds_tuo, hundreds = self._normalize_pl3_dantuo_position(payload, position="百位", dan_field="direct_hundreds_dan", tuo_field="direct_hundreds_tuo")
            tens_dan, tens_tuo, tens = self._normalize_pl3_dantuo_position(payload, position="十位", dan_field="direct_tens_dan", tuo_field="direct_tens_tuo")
            units_dan, units_tuo, units = self._normalize_pl3_dantuo_position(payload, position="个位", dan_field="direct_units_dan", tuo_field="direct_units_tuo")
            bet_count = len(hundreds) * len(tens) * len(units)
            return {
                "play_type": "pl3_dantuo",
                "front_numbers": "",
                "back_numbers": "",
                "front_dan": None,
                "front_tuo": None,
                "back_dan": None,
                "back_tuo": None,
                "direct_ten_thousands": None,
                "direct_thousands": None,
                "direct_hundreds": ",".join(hundreds),
                "direct_tens": ",".join(tens),
                "direct_units": ",".join(units),
                "direct_hundreds_dan": ",".join(hundreds_dan),
                "direct_hundreds_tuo": ",".join(hundreds_tuo),
                "direct_tens_dan": ",".join(tens_dan),
                "direct_tens_tuo": ",".join(tens_tuo),
                "direct_units_dan": ",".join(units_dan),
                "direct_units_tuo": ",".join(units_tuo),
                "group_numbers": None,
                "sum_values": None,
                "multiplier": multiplier,
                "is_append": False,
                "bet_count": bet_count,
                "amount": bet_count * 2 * multiplier,
            }
        if play_type in {"direct_sum", "group_sum"}:
            sum_values = self._normalize_sum_values(payload.get("sum_values"))
            if not sum_values:
                raise ValueError("和值至少选择 1 个号码")
            bet_count_map = self.PL3_DIRECT_SUM_BET_COUNTS if play_type == "direct_sum" else self.PL3_GROUP_SUM_BET_COUNTS
            bet_count = sum(int(bet_count_map.get(int(value), 0)) for value in sum_values)
            if bet_count <= 0:
                raise ValueError("和值投注注数计算失败")
            return {
                "play_type": play_type,
                "front_numbers": "",
                "back_numbers": "",
                "front_dan": None,
                "front_tuo": None,
                "back_dan": None,
                "back_tuo": None,
                "direct_ten_thousands": None,
                "direct_thousands": None,
                "direct_hundreds": None,
                "direct_tens": None,
                "direct_units": None,
                "group_numbers": None,
                "sum_values": ",".join(sum_values),
                "multiplier": multiplier,
                "is_append": False,
                "bet_count": bet_count,
                "amount": bet_count * 2 * multiplier,
            }
        group_numbers = self._normalize_numbers(payload.get("group_numbers"), valid_range=self.DIGIT_RANGE)
        min_count = 2 if play_type == "group3" else 3
        if len(group_numbers) < min_count:
            raise ValueError("组选号码数量不足")
        bet_count = len(group_numbers) * (len(group_numbers) - 1) if play_type == "group3" else comb(len(group_numbers), 3)
        return {
            "play_type": play_type,
            "front_numbers": "",
            "back_numbers": "",
            "front_dan": None,
            "front_tuo": None,
            "back_dan": None,
            "back_tuo": None,
            "direct_ten_thousands": None,
            "direct_thousands": None,
            "direct_hundreds": None,
            "direct_tens": None,
            "direct_units": None,
            "group_numbers": ",".join(group_numbers),
            "sum_values": None,
            "multiplier": multiplier,
            "is_append": False,
            "position_selections": [],
            "bet_count": bet_count,
            "amount": bet_count * 2 * multiplier,
        }

    def _build_qxc_line_payload(self, payload: dict[str, Any], *, multiplier: int) -> dict[str, Any]:
        play_type = str(payload.get("play_type") or "direct").strip().lower() or "direct"
        if play_type not in {"direct", "qxc_compound"}:
            raise ValueError("七星彩玩法仅支持 direct / qxc_compound")
        position_selections = self._normalize_qxc_position_selections(payload.get("position_selections"))
        if any(not values for values in position_selections):
            raise ValueError("七星彩每一位至少选择 1 个号码")
        bet_count = 1
        for values in position_selections:
            bet_count *= len(values)
        return {
            "play_type": "direct" if play_type == "direct" else "qxc_compound",
            "front_numbers": "",
            "back_numbers": "",
            "front_dan": None,
            "front_tuo": None,
            "back_dan": None,
            "back_tuo": None,
            "direct_ten_thousands": None,
            "direct_thousands": None,
            "direct_hundreds": None,
            "direct_tens": None,
            "direct_units": None,
            "group_numbers": None,
            "sum_values": None,
            "position_selections": position_selections,
            "multiplier": multiplier,
            "is_append": False,
            "bet_count": bet_count,
            "amount": bet_count * 2 * multiplier,
        }

    def _build_pl5_line_payload(self, payload: dict[str, Any], *, multiplier: int) -> dict[str, Any]:
        play_type = str(payload.get("play_type") or "direct").strip().lower()
        if play_type != "direct":
            raise ValueError("排列5玩法仅支持 direct")
        ten_thousands = self._normalize_numbers(payload.get("direct_ten_thousands"), valid_range=self.DIGIT_RANGE)
        thousands = self._normalize_numbers(payload.get("direct_thousands"), valid_range=self.DIGIT_RANGE)
        hundreds = self._normalize_numbers(payload.get("direct_hundreds"), valid_range=self.DIGIT_RANGE)
        tens = self._normalize_numbers(payload.get("direct_tens"), valid_range=self.DIGIT_RANGE)
        units = self._normalize_numbers(payload.get("direct_units"), valid_range=self.DIGIT_RANGE)
        if not ten_thousands or not thousands or not hundreds or not tens or not units:
            raise ValueError("直选需为万位、千位、百位、十位、个位各选择至少 1 个号码")
        bet_count = len(ten_thousands) * len(thousands) * len(hundreds) * len(tens) * len(units)
        return {
            "play_type": "direct",
            "front_numbers": "",
            "back_numbers": "",
            "front_dan": None,
            "front_tuo": None,
            "back_dan": None,
            "back_tuo": None,
            "direct_ten_thousands": ",".join(ten_thousands),
            "direct_thousands": ",".join(thousands),
            "direct_hundreds": ",".join(hundreds),
            "direct_tens": ",".join(tens),
            "direct_units": ",".join(units),
            "group_numbers": None,
            "sum_values": None,
            "multiplier": multiplier,
            "is_append": False,
            "bet_count": bet_count,
            "amount": bet_count * 2 * multiplier,
        }

    @staticmethod
    def _normalize_sum_values(values: Any) -> list[str]:
        if isinstance(values, str):
            values = [item for item in re_split_numbers(values) if item]
        if not isinstance(values, list):
            raise ValueError("和值格式不正确")
        normalized = sorted({str(item).zfill(2) for item in values if str(item).strip()}, key=int)
        if any(not item.isdigit() or int(item) < 0 or int(item) > 27 for item in normalized):
            raise ValueError("和值超出可选范围")
        return normalized

    @staticmethod
    def _normalize_numbers(values: Any, *, valid_range: range) -> list[str]:
        if isinstance(values, str):
            values = [item for item in re_split_numbers(values) if item]
        if not isinstance(values, list):
            raise ValueError("号码格式不正确")
        normalized = sorted({str(item).zfill(2) for item in values if str(item).strip()})
        if any(not item.isdigit() or int(item) not in valid_range for item in normalized):
            raise ValueError("号码超出可选范围")
        return normalized

    def _normalize_qxc_position_selections(self, values: Any) -> list[list[str]]:
        if not isinstance(values, list) or len(values) != 7:
            raise ValueError("七星彩需提供 7 位定位选号")
        normalized_positions: list[list[str]] = []
        for index, item in enumerate(values):
            normalized_positions.append(
                self._normalize_numbers(
                    item,
                    valid_range=self.QXC_LAST_RANGE if index == 6 else self.DIGIT_RANGE,
                )
            )
        return normalized_positions

    def _normalize_pl3_dantuo_position(
        self,
        payload: dict[str, Any],
        *,
        position: str,
        dan_field: str,
        tuo_field: str,
    ) -> tuple[list[str], list[str], list[str]]:
        dan_numbers = self._normalize_numbers(payload.get(dan_field, []), valid_range=self.DIGIT_RANGE)
        tuo_numbers = self._normalize_numbers(payload.get(tuo_field), valid_range=self.DIGIT_RANGE)
        if len(dan_numbers) > 1:
            raise ValueError(f"{position}胆码最多选择 1 个号码")
        if len(tuo_numbers) < 1:
            raise ValueError(f"{position}拖码至少选择 1 个号码")
        if set(dan_numbers) & set(tuo_numbers):
            raise ValueError(f"{position}胆码与拖码不可重复")
        return dan_numbers, tuo_numbers, sorted({*dan_numbers, *tuo_numbers})

    def _serialize_with_settlement(
        self,
        record: dict[str, Any],
        *,
        lottery_code: str,
        draw_cache: dict[str, dict[str, Any]] | None = None,
        previous_jackpot_cache: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        serialized = self._serialize_record(record)
        settlement = self._calculate_settlement(
            serialized,
            lottery_code=lottery_code,
            draw_cache=draw_cache,
            previous_jackpot_cache=previous_jackpot_cache,
        )
        return {**serialized, **settlement}

    def _calculate_settlement(
        self,
        record: dict[str, Any],
        *,
        lottery_code: str,
        draw_cache: dict[str, dict[str, Any]] | None = None,
        previous_jackpot_cache: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        target_period = str(record.get("target_period") or "")
        if not target_period:
            net_amount = int(record.get("net_amount") or 0)
            return {
                "settlement_status": "pending",
                "winning_bet_count": 0,
                "prize_level": None,
                "prize_amount": 0,
                "net_profit": -net_amount,
                "settled_at": None,
                "actual_result": None,
                "lines": list(record.get("lines") or []),
            }
        draw = (draw_cache or {}).get(target_period)
        if draw is None and draw_cache is None:
            draw = self.lottery_repository.get_draw_by_period(target_period, lottery_code=lottery_code)
        if not draw:
            net_amount = int(record.get("net_amount") or 0)
            return {
                "settlement_status": "pending",
                "winning_bet_count": 0,
                "prize_level": None,
                "prize_amount": 0,
                "net_profit": -net_amount,
                "settled_at": None,
                "actual_result": None,
                "lines": list(record.get("lines") or []),
            }
        if lottery_code == "dlt":
            previous_jackpot_pool = (previous_jackpot_cache or {}).get(target_period)
            if previous_jackpot_pool is None and previous_jackpot_cache is None:
                previous_draw = self.lottery_repository.get_previous_draw_by_period(target_period, lottery_code=lottery_code)
                previous_jackpot_pool = int(previous_draw.get("jackpot_pool_balance") or 0) if previous_draw else 0
            draw = {
                **draw,
                "previous_jackpot_pool": int(previous_jackpot_pool or 0),
            }

        total_prize_amount = 0
        total_winning_bets = 0
        best_level: str | None = None
        level_order = (
            dlt_prize_level_order(draw.get("period"))
            if lottery_code == "dlt"
            else self.PL3_PRIZE_LEVEL_ORDER if lottery_code == "pl3" else self.PL5_PRIZE_LEVEL_ORDER if lottery_code == "pl5" else self.QXC_PRIZE_LEVEL_ORDER
        )
        level_priority = {level: index for index, level in enumerate(level_order)}
        lines_with_hits: list[dict[str, Any]] = []

        for line in record.get("lines", []):
            line_result = self._calculate_line_settlement(line=line, draw=draw, lottery_code=lottery_code)
            total_prize_amount += int(line_result.get("prize_amount") or 0)
            total_winning_bets += int(line_result.get("winning_bet_count") or 0)
            lines_with_hits.append(
                {
                    **line,
                    "hit_front_numbers": list(line_result.get("hit_front_numbers") or []),
                    "hit_back_numbers": list(line_result.get("hit_back_numbers") or []),
                    "hit_direct_ten_thousands": list(line_result.get("hit_direct_ten_thousands") or []),
                    "hit_direct_thousands": list(line_result.get("hit_direct_thousands") or []),
                    "hit_direct_hundreds": list(line_result.get("hit_direct_hundreds") or []),
                    "hit_direct_tens": list(line_result.get("hit_direct_tens") or []),
                    "hit_direct_units": list(line_result.get("hit_direct_units") or []),
                    "hit_group_numbers": list(line_result.get("hit_group_numbers") or []),
                    "hit_sum_values": list(line_result.get("hit_sum_values") or []),
                    "hit_position_selections": list(line_result.get("hit_position_selections") or []),
                }
            )
            level = line_result.get("prize_level")
            if level and (best_level is None or level_priority.get(str(level), 999) < level_priority.get(str(best_level), 999)):
                best_level = str(level)
        return {
            "settlement_status": "settled",
            "winning_bet_count": total_winning_bets,
            "prize_level": best_level,
            "prize_amount": total_prize_amount,
            "net_profit": total_prize_amount - int(record.get("net_amount") or 0),
            "settled_at": now_ts(),
            "actual_result": self._serialize_actual_result(draw, lottery_code=lottery_code, target_period=target_period),
            "lines": lines_with_hits,
        }

    def _calculate_line_settlement(self, *, line: dict[str, Any], draw: dict[str, Any], lottery_code: str) -> dict[str, Any]:
        if lottery_code == "dlt":
            return self._calculate_dlt_line_settlement(line, draw)
        if lottery_code == "pl3":
            return self._calculate_pl3_line_settlement(line, draw)
        if lottery_code == "pl5":
            return self._calculate_pl5_line_settlement(line, draw)
        return self._calculate_qxc_line_settlement(line, draw)

    def _calculate_dlt_line_settlement(self, line: dict[str, Any], draw: dict[str, Any]) -> dict[str, Any]:
        play_type = str(line.get("play_type") or "dlt").strip().lower() or "dlt"
        if play_type == "dlt_dantuo":
            hit_result = PredictionService._calculate_dlt_dantuo_hit_result(
                {
                    "play_type": "dlt_dantuo",
                    "front_dan": list(line.get("front_dan") or []),
                    "front_tuo": list(line.get("front_tuo") or []),
                    "back_dan": list(line.get("back_dan") or []),
                    "back_tuo": list(line.get("back_tuo") or []),
                },
                draw,
            )
            breakdown = {
                str(item.get("prize_level") or ""): int(item.get("count") or 0)
                for item in list(hit_result.get("prize_breakdown") or [])
                if str(item.get("prize_level") or "").strip() and int(item.get("count") or 0) > 0
            }
            is_append = bool(line.get("is_append"))
            total_prize = 0
            total_winning_bets = 0
            best_level = None
            for level in dlt_prize_level_order(draw.get("period")):
                winning_count = int(breakdown.get(level) or 0)
                if winning_count <= 0:
                    continue
                basic_amount = self._resolve_dlt_prize_amount(draw, level, prize_type="basic")
                additional_amount = self._resolve_dlt_prize_amount(draw, level, prize_type="additional") if is_append else 0
                per_bet_amount = basic_amount + additional_amount
                total_prize += winning_count * per_bet_amount * int(line.get("multiplier") or 1)
                total_winning_bets += winning_count
                if best_level is None:
                    best_level = level
            return {
                "winning_bet_count": total_winning_bets,
                "prize_level": best_level,
                "prize_amount": total_prize,
                "hit_front_numbers": list(hit_result.get("red_hits") or []),
                "hit_back_numbers": list(hit_result.get("blue_hits") or []),
                "hit_direct_ten_thousands": [],
                "hit_direct_thousands": [],
                "hit_direct_hundreds": [],
                "hit_direct_tens": [],
                "hit_direct_units": [],
                "hit_group_numbers": [],
                "hit_sum_values": [],
                "hit_position_selections": [],
            }
        front_numbers = list(line.get("front_numbers") or [])
        back_numbers = list(line.get("back_numbers") or [])
        draw_red_balls = list(draw.get("red_balls") or [])
        draw_blue_balls = list(draw.get("blue_balls") or [])
        front_hits = [ball for ball in front_numbers if ball in draw_red_balls]
        back_hits = [ball for ball in back_numbers if ball in draw_blue_balls]
        red_hits = len(front_hits)
        blue_hits = len(back_hits)
        breakdown = self._calculate_dlt_prize_breakdown(
            len(front_numbers),
            len(back_numbers),
            red_hits,
            blue_hits,
            period=str(draw.get("period") or ""),
        )
        is_append = bool(line.get("is_append"))
        total_prize = 0
        total_winning_bets = 0
        best_level = None
        for level in dlt_prize_level_order(draw.get("period")):
            winning_count = breakdown.get(level, 0)
            if winning_count <= 0:
                continue
            basic_amount = self._resolve_dlt_prize_amount(draw, level, prize_type="basic")
            additional_amount = self._resolve_dlt_prize_amount(draw, level, prize_type="additional") if is_append else 0
            per_bet_amount = basic_amount + additional_amount
            total_prize += winning_count * per_bet_amount * int(line.get("multiplier") or 1)
            total_winning_bets += winning_count
            if best_level is None:
                best_level = level
        return {
            "winning_bet_count": total_winning_bets,
            "prize_level": best_level,
            "prize_amount": total_prize,
            "hit_front_numbers": front_hits,
            "hit_back_numbers": back_hits,
            "hit_direct_ten_thousands": [],
            "hit_direct_thousands": [],
            "hit_direct_hundreds": [],
            "hit_direct_tens": [],
            "hit_direct_units": [],
            "hit_group_numbers": [],
            "hit_sum_values": [],
            "hit_position_selections": [],
        }

    def _calculate_pl3_line_settlement(self, line: dict[str, Any], draw: dict[str, Any]) -> dict[str, Any]:
        play_type = str(line.get("play_type") or "direct")
        digits = normalize_digit_balls(draw.get("digits", draw.get("red_balls", [])))
        multiplier = int(line.get("multiplier") or 1)
        actual_sum = sum(int(item) for item in digits) if len(digits) == 3 else -1
        actual_sum_value = str(actual_sum).zfill(2) if actual_sum >= 0 else ""
        level = None
        winning_count = 0
        if play_type == "direct":
            hundreds = list(line.get("direct_hundreds") or [])
            tens = list(line.get("direct_tens") or [])
            units = list(line.get("direct_units") or [])
            matched = len(digits) == 3 and digits[0] in hundreds and digits[1] in tens and digits[2] in units
            if matched:
                level = "直选"
                winning_count = 1
        elif play_type == "pl3_dantuo":
            hundreds = list(line.get("direct_hundreds") or [])
            tens = list(line.get("direct_tens") or [])
            units = list(line.get("direct_units") or [])
            matched = len(digits) == 3 and digits[0] in hundreds and digits[1] in tens and digits[2] in units
            if matched:
                level = "直选"
                winning_count = 1
        elif play_type == "direct_sum":
            selected_sums = set(line.get("sum_values") or [])
            if actual_sum_value and actual_sum_value in selected_sums:
                level = "和值"
                winning_count = 1
        elif play_type == "group_sum":
            selected_sums = set(line.get("sum_values") or [])
            unique_digits = set(digits)
            if actual_sum_value and actual_sum_value in selected_sums and len(unique_digits) >= 2:
                level = "和值"
                winning_count = 1
        elif play_type == "group3":
            unique_digits = sorted(set(digits))
            selected = set(line.get("group_numbers") or [])
            if len(unique_digits) == 2 and all(item in selected for item in unique_digits):
                level = "组选3"
                winning_count = 1
        elif play_type == "group6":
            unique_digits = sorted(set(digits))
            selected = set(line.get("group_numbers") or [])
            if len(unique_digits) == 3 and all(item in selected for item in unique_digits):
                level = "组选6"
                winning_count = 1
        per_bet_amount = PredictionService.PL3_FIXED_PRIZE_RULES.get(level or "", 0)
        hit_hundreds = [item for item in list(line.get("direct_hundreds") or []) if len(digits) == 3 and item == digits[0]]
        hit_tens = [item for item in list(line.get("direct_tens") or []) if len(digits) == 3 and item == digits[1]]
        hit_units = [item for item in list(line.get("direct_units") or []) if len(digits) == 3 and item == digits[2]]
        hit_groups = [item for item in list(line.get("group_numbers") or []) if item in digits]
        hit_sums = [actual_sum_value] if level == "和值" and actual_sum_value else []
        return {
            "winning_bet_count": winning_count,
            "prize_level": level,
            "prize_amount": winning_count * per_bet_amount * multiplier,
            "hit_front_numbers": [],
            "hit_back_numbers": [],
            "hit_direct_ten_thousands": [],
            "hit_direct_thousands": [],
            "hit_direct_hundreds": hit_hundreds,
            "hit_direct_tens": hit_tens,
            "hit_direct_units": hit_units,
            "hit_group_numbers": hit_groups,
            "hit_sum_values": hit_sums,
            "hit_position_selections": [],
        }

    def _calculate_pl5_line_settlement(self, line: dict[str, Any], draw: dict[str, Any]) -> dict[str, Any]:
        digits = normalize_digit_balls(draw.get("digits", draw.get("red_balls", [])))
        multiplier = int(line.get("multiplier") or 1)
        ten_thousands = list(line.get("direct_ten_thousands") or [])
        thousands = list(line.get("direct_thousands") or [])
        hundreds = list(line.get("direct_hundreds") or [])
        tens = list(line.get("direct_tens") or [])
        units = list(line.get("direct_units") or [])
        matched = (
            len(digits) == 5
            and digits[0] in ten_thousands
            and digits[1] in thousands
            and digits[2] in hundreds
            and digits[3] in tens
            and digits[4] in units
        )
        level = "直选" if matched else None
        winning_count = 1 if matched else 0
        per_bet_amount = PredictionService.PL5_FIXED_PRIZE_RULES.get(level or "", 0)
        return {
            "winning_bet_count": winning_count,
            "prize_level": level,
            "prize_amount": winning_count * per_bet_amount * multiplier,
            "hit_front_numbers": [],
            "hit_back_numbers": [],
            "hit_direct_ten_thousands": [item for item in ten_thousands if len(digits) == 5 and item == digits[0]],
            "hit_direct_thousands": [item for item in thousands if len(digits) == 5 and item == digits[1]],
            "hit_direct_hundreds": [item for item in hundreds if len(digits) == 5 and item == digits[2]],
            "hit_direct_tens": [item for item in tens if len(digits) == 5 and item == digits[3]],
            "hit_direct_units": [item for item in units if len(digits) == 5 and item == digits[4]],
            "hit_group_numbers": [],
            "hit_sum_values": [],
            "hit_position_selections": [],
        }

    def _calculate_qxc_line_settlement(self, line: dict[str, Any], draw: dict[str, Any]) -> dict[str, Any]:
        digits = normalize_digit_balls(draw.get("digits", draw.get("red_balls", [])))[:7]
        position_selections = [list(item) for item in list(line.get("position_selections") or [])]
        if len(position_selections) != 7:
            position_selections = [[] for _ in range(7)]
        prize_breakdown = PredictionService._calculate_qxc_prize_breakdown(position_selections, digits)
        level = next((item for item in self.QXC_PRIZE_LEVEL_ORDER if prize_breakdown.get(item, 0) > 0), None)
        winning_count = int(prize_breakdown.get(level or "", 0))
        prize_map = {
            "三等奖": 3000,
            "四等奖": 500,
            "五等奖": 30,
            "六等奖": 5,
        }
        per_bet_amount = 0
        if level in {"一等奖", "二等奖"}:
            for prize in draw.get("prize_breakdown", []) or []:
                if str(prize.get("prize_level") or "") == level and str(prize.get("prize_type") or "basic") == "basic":
                    per_bet_amount = int(prize.get("prize_amount") or 0)
                    break
        else:
            per_bet_amount = prize_map.get(level or "", 0)
        hit_positions = [[digits[index]] if index < len(digits) and digits[index] in position_selections[index] else [] for index in range(7)]
        return {
            "winning_bet_count": winning_count,
            "prize_level": level,
            "prize_amount": winning_count * per_bet_amount * int(line.get("multiplier") or 1),
            "hit_front_numbers": [],
            "hit_back_numbers": [],
            "hit_direct_ten_thousands": [],
            "hit_direct_thousands": [],
            "hit_direct_hundreds": [],
            "hit_direct_tens": [],
            "hit_direct_units": [],
            "hit_group_numbers": [],
            "hit_sum_values": [],
            "hit_position_selections": hit_positions,
        }

    @staticmethod
    def _serialize_actual_result(draw: dict[str, Any], *, lottery_code: str, target_period: str = "") -> dict[str, Any]:
        digits = normalize_digit_balls(draw.get("digits", draw.get("red_balls", [])))
        return {
            "lottery_code": lottery_code,
            "period": str(draw.get("period") or target_period),
            "date": str(draw.get("date") or ""),
            "red_balls": sorted(set(normalize_digit_balls(draw.get("red_balls", [])))),
            "blue_balls": sorted(set(normalize_digit_balls(draw.get("blue_balls", [])))),
            "digits": digits[:7] if lottery_code == "qxc" else digits[:5] if lottery_code == "pl5" else digits[:3],
            "jackpot_pool_balance": int(draw.get("jackpot_pool_balance") or 0),
            "previous_jackpot_pool": int(draw.get("previous_jackpot_pool") or 0),
        }

    @staticmethod
    def _calculate_dlt_prize_breakdown(
        front_count: int,
        back_count: int,
        red_hit_count: int,
        blue_hit_count: int,
        *,
        period: str,
    ) -> dict[str, int]:
        if not is_dlt_new_rule_period(period):
            conditions = [
                {"red_hits": 5, "blue_hits": 2, "level": "一等奖"},
                {"red_hits": 5, "blue_hits": 1, "level": "二等奖"},
                {"red_hits": 5, "blue_hits": 0, "level": "三等奖"},
                {"red_hits": 4, "blue_hits": 2, "level": "四等奖"},
                {"red_hits": 4, "blue_hits": 1, "level": "五等奖"},
                {"red_hits": 3, "blue_hits": 2, "level": "六等奖"},
                {"red_hits": 4, "blue_hits": 0, "level": "七等奖"},
                {"red_hits": 3, "blue_hits": 1, "level": "八等奖"},
                {"red_hits": 2, "blue_hits": 2, "level": "八等奖"},
                {"red_hits": 3, "blue_hits": 0, "level": "九等奖"},
                {"red_hits": 2, "blue_hits": 1, "level": "九等奖"},
                {"red_hits": 1, "blue_hits": 2, "level": "九等奖"},
                {"red_hits": 0, "blue_hits": 2, "level": "九等奖"},
            ]
        else:
            conditions = [
                {"red_hits": 5, "blue_hits": 2, "level": "一等奖"},
                {"red_hits": 5, "blue_hits": 1, "level": "二等奖"},
                {"red_hits": 5, "blue_hits": 0, "level": "三等奖"},
                {"red_hits": 4, "blue_hits": 2, "level": "三等奖"},
                {"red_hits": 4, "blue_hits": 1, "level": "四等奖"},
                {"red_hits": 4, "blue_hits": 0, "level": "五等奖"},
                {"red_hits": 3, "blue_hits": 2, "level": "五等奖"},
                {"red_hits": 3, "blue_hits": 1, "level": "六等奖"},
                {"red_hits": 2, "blue_hits": 2, "level": "六等奖"},
                {"red_hits": 3, "blue_hits": 0, "level": "七等奖"},
                {"red_hits": 2, "blue_hits": 1, "level": "七等奖"},
                {"red_hits": 1, "blue_hits": 2, "level": "七等奖"},
                {"red_hits": 0, "blue_hits": 2, "level": "七等奖"},
            ]
        miss_front = front_count - red_hit_count
        miss_back = back_count - blue_hit_count
        result: dict[str, int] = {}
        for condition in conditions:
            count = (
                comb(red_hit_count, condition["red_hits"])
                * comb(miss_front, 5 - condition["red_hits"])
                * comb(blue_hit_count, condition["blue_hits"])
                * comb(miss_back, 2 - condition["blue_hits"])
            )
            if count <= 0:
                continue
            level = str(condition["level"])
            result[level] = result.get(level, 0) + int(count)
        return result

    def _resolve_dlt_prize_amount(self, draw: dict[str, Any], level: str, *, prize_type: str) -> int:
        for prize in draw.get("prize_breakdown", []) or []:
            if str(prize.get("prize_level") or "") == level and str(prize.get("prize_type") or "basic") == prize_type:
                amount = int(prize.get("prize_amount") or 0)
                if amount > 0:
                    return amount
        if prize_type == "basic":
            return resolve_dlt_fallback_prize_amount(
                level,
                draw.get("period"),
                int(draw.get("previous_jackpot_pool") or 0),
            )
        return 0

    @staticmethod
    def _serialize_record(record: dict[str, Any]) -> dict[str, Any]:
        def parse_numbers(value: Any) -> list[str]:
            text = str(value or "").strip()
            if not text:
                return []
            return [item for item in text.split(",") if str(item).strip()]

        def normalize_numbers(value: Any) -> list[str]:
            return sorted(set(normalize_digit_balls(parse_numbers(value))))

        created_at = record.get("created_at")
        updated_at = record.get("updated_at")
        ocr_recognized_at = record.get("ocr_recognized_at")
        ticket_purchased_at = record.get("ticket_purchased_at")
        created_at = ensure_timestamp(created_at)
        updated_at = ensure_timestamp(updated_at)
        ocr_recognized_at = ensure_timestamp(ocr_recognized_at, assume_beijing=True)
        ticket_purchased_at = ensure_timestamp(ticket_purchased_at, assume_beijing=True)

        raw_lines = record.get("lines") if isinstance(record.get("lines"), list) else []
        lines = [MyBetService._serialize_line(item) for item in raw_lines]
        if not lines:
            lines = [
                {
                    "line_no": 1,
                    "play_type": str(record.get("play_type") or "dlt"),
                    "front_numbers": normalize_numbers(record.get("front_numbers")),
                    "back_numbers": normalize_numbers(record.get("back_numbers")),
                    "front_dan": normalize_numbers(record.get("front_dan")),
                    "front_tuo": normalize_numbers(record.get("front_tuo")),
                    "back_dan": normalize_numbers(record.get("back_dan")),
                    "back_tuo": normalize_numbers(record.get("back_tuo")),
                    "direct_ten_thousands": normalize_numbers(record.get("direct_ten_thousands")),
                    "direct_thousands": normalize_numbers(record.get("direct_thousands")),
                    "direct_hundreds": normalize_numbers(record.get("direct_hundreds")),
                    "direct_tens": normalize_numbers(record.get("direct_tens")),
                    "direct_units": normalize_numbers(record.get("direct_units")),
                    "direct_hundreds_dan": normalize_numbers(record.get("direct_hundreds_dan")),
                    "direct_hundreds_tuo": normalize_numbers(record.get("direct_hundreds_tuo")),
                    "direct_tens_dan": normalize_numbers(record.get("direct_tens_dan")),
                    "direct_tens_tuo": normalize_numbers(record.get("direct_tens_tuo")),
                    "direct_units_dan": normalize_numbers(record.get("direct_units_dan")),
                    "direct_units_tuo": normalize_numbers(record.get("direct_units_tuo")),
                    "group_numbers": normalize_numbers(record.get("group_numbers")),
                    "sum_values": normalize_numbers(record.get("sum_values")),
                    "position_selections": list(record.get("position_selections") or []),
                    "multiplier": int(record.get("multiplier") or 1),
                    "is_append": bool(record.get("is_append")),
                    "bet_count": int(record.get("bet_count") or 0),
                    "amount": int(record.get("amount") or 0),
                }
            ]

        first_line = lines[0]
        amount = int(record.get("amount") or 0)
        discount_amount = int(record.get("discount_amount") or 0)
        discount_amount = min(max(discount_amount, 0), amount)
        net_amount = amount - discount_amount
        return {
            "id": int(record.get("id") or 0),
            "lottery_code": str(record.get("lottery_code") or "dlt"),
            "target_period": str(record.get("target_period") or ""),
            "play_type": str(record.get("play_type") or first_line.get("play_type") or "dlt"),
            "front_numbers": list(first_line.get("front_numbers") or []),
            "back_numbers": list(first_line.get("back_numbers") or []),
            "front_dan": list(first_line.get("front_dan") or []),
            "front_tuo": list(first_line.get("front_tuo") or []),
            "back_dan": list(first_line.get("back_dan") or []),
            "back_tuo": list(first_line.get("back_tuo") or []),
            "direct_ten_thousands": list(first_line.get("direct_ten_thousands") or []),
            "direct_thousands": list(first_line.get("direct_thousands") or []),
            "direct_hundreds": list(first_line.get("direct_hundreds") or []),
            "direct_tens": list(first_line.get("direct_tens") or []),
            "direct_units": list(first_line.get("direct_units") or []),
            "direct_hundreds_dan": list(first_line.get("direct_hundreds_dan") or []),
            "direct_hundreds_tuo": list(first_line.get("direct_hundreds_tuo") or []),
            "direct_tens_dan": list(first_line.get("direct_tens_dan") or []),
            "direct_tens_tuo": list(first_line.get("direct_tens_tuo") or []),
            "direct_units_dan": list(first_line.get("direct_units_dan") or []),
            "direct_units_tuo": list(first_line.get("direct_units_tuo") or []),
            "group_numbers": list(first_line.get("group_numbers") or []),
            "sum_values": list(first_line.get("sum_values") or []),
            "position_selections": [list(item) for item in list(first_line.get("position_selections") or [])],
            "multiplier": int(record.get("multiplier") or first_line.get("multiplier") or 1),
            "is_append": bool(record.get("is_append") if record.get("is_append") is not None else first_line.get("is_append")),
            "bet_count": int(record.get("bet_count") or 0),
            "amount": amount,
            "discount_amount": discount_amount,
            "net_amount": net_amount,
            "source_type": str(record.get("source_type") or "manual"),
            "ticket_image_url": str(record.get("ticket_image_url") or ""),
            "ocr_text": str(record.get("ocr_text") or ""),
            "ocr_provider": str(record.get("ocr_provider") or "") or None,
            "ocr_recognized_at": ocr_recognized_at,
            "ticket_purchased_at": ticket_purchased_at,
            "actual_result": record.get("actual_result") if isinstance(record.get("actual_result"), dict) else None,
            "lines": lines,
            "created_at": created_at or 0,
            "updated_at": updated_at or created_at or 0,
        }

    @staticmethod
    def _serialize_line(line: dict[str, Any]) -> dict[str, Any]:
        def parse_numbers(value: Any) -> list[str]:
            if isinstance(value, list):
                return [str(item).strip() for item in value if str(item).strip()]
            text = str(value or "").strip()
            if not text:
                return []
            return [item for item in text.split(",") if str(item).strip()]

        def normalize_numbers(value: Any) -> list[str]:
            return sorted(set(normalize_digit_balls(parse_numbers(value))))

        return {
            "line_no": int(line.get("line_no") or 0),
            "play_type": str(line.get("play_type") or "dlt"),
            "front_numbers": normalize_numbers(line.get("front_numbers")),
            "back_numbers": normalize_numbers(line.get("back_numbers")),
            "front_dan": normalize_numbers(line.get("front_dan")),
            "front_tuo": normalize_numbers(line.get("front_tuo")),
            "back_dan": normalize_numbers(line.get("back_dan")),
            "back_tuo": normalize_numbers(line.get("back_tuo")),
            "direct_ten_thousands": normalize_numbers(line.get("direct_ten_thousands")),
            "direct_thousands": normalize_numbers(line.get("direct_thousands")),
            "direct_hundreds": normalize_numbers(line.get("direct_hundreds")),
            "direct_tens": normalize_numbers(line.get("direct_tens")),
            "direct_units": normalize_numbers(line.get("direct_units")),
            "direct_hundreds_dan": normalize_numbers(line.get("direct_hundreds_dan")),
            "direct_hundreds_tuo": normalize_numbers(line.get("direct_hundreds_tuo")),
            "direct_tens_dan": normalize_numbers(line.get("direct_tens_dan")),
            "direct_tens_tuo": normalize_numbers(line.get("direct_tens_tuo")),
            "direct_units_dan": normalize_numbers(line.get("direct_units_dan")),
            "direct_units_tuo": normalize_numbers(line.get("direct_units_tuo")),
            "group_numbers": normalize_numbers(line.get("group_numbers")),
            "sum_values": normalize_numbers(line.get("sum_values")),
            "position_selections": [
                normalize_numbers(item)
                for item in list(line.get("position_selections") or [])
                if isinstance(item, list)
            ],
            "hit_front_numbers": normalize_numbers(line.get("hit_front_numbers")),
            "hit_back_numbers": normalize_numbers(line.get("hit_back_numbers")),
            "hit_direct_ten_thousands": normalize_numbers(line.get("hit_direct_ten_thousands")),
            "hit_direct_thousands": normalize_numbers(line.get("hit_direct_thousands")),
            "hit_direct_hundreds": normalize_numbers(line.get("hit_direct_hundreds")),
            "hit_direct_tens": normalize_numbers(line.get("hit_direct_tens")),
            "hit_direct_units": normalize_numbers(line.get("hit_direct_units")),
            "hit_group_numbers": normalize_numbers(line.get("hit_group_numbers")),
            "hit_sum_values": normalize_numbers(line.get("hit_sum_values")),
            "hit_position_selections": [
                normalize_numbers(item)
                for item in list(line.get("hit_position_selections") or [])
                if isinstance(item, list)
            ],
            "multiplier": int(line.get("multiplier") or 1),
            "is_append": bool(line.get("is_append")),
            "bet_count": int(line.get("bet_count") or 0),
            "amount": int(line.get("amount") or 0),
        }


def re_split_numbers(value: str) -> list[str]:
    return [item for item in re.split(r"[,\s，、;；|/]+", str(value or "").strip()) if item]
