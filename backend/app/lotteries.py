from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any


SUPPORTED_LOTTERY_CODES = ("dlt", "pl3", "pl5", "qxc")


def normalize_lottery_code(value: str | None) -> str:
    code = str(value or "dlt").strip().lower()
    if code not in SUPPORTED_LOTTERY_CODES:
        raise ValueError("不支持的彩种")
    return code


def storage_issue_no(lottery_code: str, period: str) -> str:
    normalize_lottery_code(lottery_code)
    return str(period or "").strip()


def display_period(lottery_code: str, issue_no: str) -> str:
    normalize_lottery_code(lottery_code)
    return str(issue_no or "").strip()


def pad_number(value: Any, *, width: int = 2) -> str:
    return str(value).strip().zfill(width)


def normalize_digit_balls(values: list[Any] | None) -> list[str]:
    return [pad_number(value, width=2) for value in (values or [])]


def normalize_direct_digits(values: list[Any] | None) -> list[str]:
    return normalize_digit_balls(values)[:3]


def normalize_group_digits(values: list[Any] | None) -> list[str]:
    return sorted(normalize_digit_balls(values)[:3])


def normalize_qxc_position_digits(values: list[Any] | None, *, last: bool = False) -> list[str]:
    normalized = normalize_digit_balls(values)
    valid_range = range(0, 15) if last else range(0, 10)
    result: list[str] = []
    for value in normalized:
        if not value.isdigit():
            continue
        number = int(value)
        if number not in valid_range:
            continue
        result.append(value)
    return result


def build_pl3_prize_breakdown() -> list[dict[str, Any]]:
    return [
        {"prize_level": "直选", "prize_type": "basic", "winner_count": 0, "prize_amount": 1040, "total_amount": 0},
        {"prize_level": "组选3", "prize_type": "basic", "winner_count": 0, "prize_amount": 346, "total_amount": 0},
        {"prize_level": "组选6", "prize_type": "basic", "winner_count": 0, "prize_amount": 173, "total_amount": 0},
    ]


def build_pl5_prize_breakdown() -> list[dict[str, Any]]:
    return [
        {"prize_level": "直选", "prize_type": "basic", "winner_count": 0, "prize_amount": 100000, "total_amount": 0},
    ]


def build_qxc_prize_breakdown() -> list[dict[str, Any]]:
    return [
        {"prize_level": "一等奖", "prize_type": "basic", "winner_count": 0, "prize_amount": 0, "total_amount": 0},
        {"prize_level": "二等奖", "prize_type": "basic", "winner_count": 0, "prize_amount": 0, "total_amount": 0},
        {"prize_level": "三等奖", "prize_type": "basic", "winner_count": 0, "prize_amount": 3000, "total_amount": 0},
        {"prize_level": "四等奖", "prize_type": "basic", "winner_count": 0, "prize_amount": 500, "total_amount": 0},
        {"prize_level": "五等奖", "prize_type": "basic", "winner_count": 0, "prize_amount": 30, "total_amount": 0},
        {"prize_level": "六等奖", "prize_type": "basic", "winner_count": 0, "prize_amount": 5, "total_amount": 0},
    ]


@dataclass(frozen=True)
class LotteryDefinition:
    code: str
    name: str
    draw_time: str
    ball_layout: str

    def predict_next_draw(self, latest_period: str, latest_date: str) -> dict[str, Any] | None:
        if self.code in {"dlt", "qxc"}:
            return _predict_next_dlt_draw(latest_period, latest_date)
        return _predict_next_daily_draw(latest_period, latest_date, self.draw_time)


LOTTERY_DEFINITIONS: dict[str, LotteryDefinition] = {
    "dlt": LotteryDefinition(code="dlt", name="大乐透", draw_time="21:25", ball_layout="dual"),
    "pl3": LotteryDefinition(code="pl3", name="排列3", draw_time="20:30", ball_layout="digit"),
    "pl5": LotteryDefinition(code="pl5", name="排列5", draw_time="20:30", ball_layout="digit"),
    "qxc": LotteryDefinition(code="qxc", name="七星彩", draw_time="21:25", ball_layout="digit"),
}


def get_lottery_definition(lottery_code: str) -> LotteryDefinition:
    return LOTTERY_DEFINITIONS[normalize_lottery_code(lottery_code)]


def _predict_next_dlt_draw(latest_period: str, latest_date: str) -> dict[str, Any] | None:
    try:
        period_num = int(latest_period)
        last_draw_date = datetime.strptime(latest_date, "%Y-%m-%d")
        draw_weekdays = [0, 2, 5]
        next_date = last_draw_date + timedelta(days=1)
        while next_date.weekday() not in draw_weekdays:
            next_date += timedelta(days=1)
        weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        return {
            "next_period": str(period_num + 1).zfill(len(latest_period)),
            "next_date": next_date.strftime("%Y-%m-%d"),
            "next_date_display": next_date.strftime("%Y年%m月%d日"),
            "weekday": weekday_names[next_date.weekday()],
            "draw_time": "21:25",
        }
    except Exception:
        return None


def _predict_next_daily_draw(latest_period: str, latest_date: str, draw_time: str) -> dict[str, Any] | None:
    try:
        period_num = int(latest_period)
        last_draw_date = datetime.strptime(latest_date, "%Y-%m-%d")
        next_date = last_draw_date + timedelta(days=1)
        weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        return {
            "next_period": str(period_num + 1).zfill(len(latest_period)),
            "next_date": next_date.strftime("%Y-%m-%d"),
            "next_date_display": next_date.strftime("%Y年%m月%d日"),
            "weekday": weekday_names[next_date.weekday()],
            "draw_time": draw_time,
        }
    except Exception:
        return None
