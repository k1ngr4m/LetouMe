from __future__ import annotations

from typing import Final


DLT_RULE_SWITCH_PERIOD: Final[int] = 26014
DLT_NEW_RULE_JACKPOT_THRESHOLD: Final[int] = 800_000_000

DLT_OLD_PRIZE_LEVEL_ORDER: Final[list[str]] = ["一等奖", "二等奖", "三等奖", "四等奖", "五等奖", "六等奖", "七等奖", "八等奖", "九等奖"]
DLT_NEW_PRIZE_LEVEL_ORDER: Final[list[str]] = ["一等奖", "二等奖", "三等奖", "四等奖", "五等奖", "六等奖", "七等奖"]

DLT_OLD_FIXED_PRIZE_RULES: Final[dict[str, int]] = {
    "三等奖": 10000,
    "四等奖": 3000,
    "五等奖": 300,
    "六等奖": 200,
    "七等奖": 100,
    "八等奖": 15,
    "九等奖": 5,
}

DLT_NEW_FIXED_PRIZE_RULES_LOW: Final[dict[str, int]] = {
    "三等奖": 5000,
    "四等奖": 300,
    "五等奖": 150,
    "六等奖": 15,
    "七等奖": 5,
}

DLT_NEW_FIXED_PRIZE_RULES_HIGH: Final[dict[str, int]] = {
    "三等奖": 6666,
    "四等奖": 380,
    "五等奖": 200,
    "六等奖": 18,
    "七等奖": 7,
}


def normalize_dlt_period_value(period: str | int | None) -> int:
    text = "".join(ch for ch in str(period or "") if ch.isdigit())
    if not text:
        return 0
    if len(text) >= 5:
        text = text[-5:]
    try:
        return int(text)
    except ValueError:
        return 0


def is_dlt_new_rule_period(period: str | int | None) -> bool:
    return normalize_dlt_period_value(period) >= DLT_RULE_SWITCH_PERIOD


def dlt_prize_level_order(period: str | int | None) -> list[str]:
    return list(DLT_NEW_PRIZE_LEVEL_ORDER if is_dlt_new_rule_period(period) else DLT_OLD_PRIZE_LEVEL_ORDER)


def resolve_dlt_prize_level(red_hit_count: int, blue_hit_count: int, period: str | int | None) -> str | None:
    if red_hit_count == 5 and blue_hit_count == 2:
        return "一等奖"
    if red_hit_count == 5 and blue_hit_count == 1:
        return "二等奖"
    if is_dlt_new_rule_period(period):
        if (red_hit_count == 5 and blue_hit_count == 0) or (red_hit_count == 4 and blue_hit_count == 2):
            return "三等奖"
        if red_hit_count == 4 and blue_hit_count == 1:
            return "四等奖"
        if (red_hit_count == 4 and blue_hit_count == 0) or (red_hit_count == 3 and blue_hit_count == 2):
            return "五等奖"
        if (red_hit_count == 3 and blue_hit_count == 1) or (red_hit_count == 2 and blue_hit_count == 2):
            return "六等奖"
        if (
            (red_hit_count == 3 and blue_hit_count == 0)
            or (red_hit_count == 2 and blue_hit_count == 1)
            or (red_hit_count == 1 and blue_hit_count == 2)
            or (red_hit_count == 0 and blue_hit_count == 2)
        ):
            return "七等奖"
        return None
    if red_hit_count == 5 and blue_hit_count == 0:
        return "三等奖"
    if red_hit_count == 4 and blue_hit_count == 2:
        return "四等奖"
    if red_hit_count == 4 and blue_hit_count == 1:
        return "五等奖"
    if red_hit_count == 3 and blue_hit_count == 2:
        return "六等奖"
    if red_hit_count == 4 and blue_hit_count == 0:
        return "七等奖"
    if (red_hit_count == 3 and blue_hit_count == 1) or (red_hit_count == 2 and blue_hit_count == 2):
        return "八等奖"
    if (
        (red_hit_count == 3 and blue_hit_count == 0)
        or (red_hit_count == 2 and blue_hit_count == 1)
        or (red_hit_count == 1 and blue_hit_count == 2)
        or (red_hit_count == 0 and blue_hit_count == 2)
    ):
        return "九等奖"
    return None


def resolve_dlt_fallback_prize_amount(prize_level: str, period: str | int | None, previous_jackpot_pool: int | None) -> int:
    if is_dlt_new_rule_period(period):
        pool = int(previous_jackpot_pool or 0)
        tier_rules = DLT_NEW_FIXED_PRIZE_RULES_HIGH if pool >= DLT_NEW_RULE_JACKPOT_THRESHOLD else DLT_NEW_FIXED_PRIZE_RULES_LOW
        return int(tier_rules.get(prize_level) or 0)
    return int(DLT_OLD_FIXED_PRIZE_RULES.get(prize_level) or 0)
