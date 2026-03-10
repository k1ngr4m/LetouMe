from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from app.repositories.lottery_repository import LotteryRepository


class LotteryService:
    def __init__(self, repository: LotteryRepository | None = None) -> None:
        self.repository = repository or LotteryRepository()

    @staticmethod
    def normalize_blue_balls(value: Any) -> list[str]:
        if isinstance(value, list):
            return sorted(str(item).zfill(2) for item in value)
        if isinstance(value, str) and value:
            return [str(value).zfill(2)]
        return []

    def normalize_draw(self, draw: dict[str, Any]) -> dict[str, Any]:
        blue_balls = self.normalize_blue_balls(draw.get("blue_balls", draw.get("blue_ball")))
        return {
            "period": str(draw.get("period", "")),
            "red_balls": sorted(str(item).zfill(2) for item in draw.get("red_balls", [])),
            "blue_balls": blue_balls,
            "blue_ball": blue_balls[0] if blue_balls else None,
            "date": draw.get("date", ""),
        }

    def save_draws(self, draws: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = [self.normalize_draw(draw) for draw in draws]
        self.repository.upsert_draws(normalized)
        return normalized

    def get_history_payload(self, limit: int | None = None) -> dict[str, Any]:
        draws = self.repository.list_draws(limit=limit)
        last_updated = max(
            (draw.get("updated_at") for draw in draws if draw.get("updated_at")),
            default=datetime.utcnow(),
        )
        payload = {
            "last_updated": last_updated.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "data": [self.normalize_draw(draw) for draw in draws],
        }
        if payload["data"]:
            payload["next_draw"] = self.predict_next_draw(
                payload["data"][0]["period"],
                payload["data"][0]["date"],
            )
        return payload

    def get_draw_by_period(self, period: str) -> dict[str, Any] | None:
        draw = self.repository.get_draw_by_period(period)
        return self.normalize_draw(draw) if draw else None

    def get_recent_draws(self, limit: int = 30) -> list[dict[str, Any]]:
        return [self.normalize_draw(draw) for draw in self.repository.list_draws(limit=limit)]

    @staticmethod
    def predict_next_draw(latest_period: str, latest_date: str) -> dict[str, Any] | None:
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
