from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from backend.app.cache import runtime_cache
from backend.app.logging_utils import get_logger
from backend.app.lotteries import get_lottery_definition, normalize_digit_balls, normalize_lottery_code
from backend.app.repositories.lottery_repository import LotteryRepository


class LotteryService:
    def __init__(self, repository: LotteryRepository | None = None) -> None:
        self.repository = repository or LotteryRepository()
        self.logger = get_logger("services.lottery")

    @staticmethod
    def normalize_blue_balls(value: Any) -> list[str]:
        if isinstance(value, list):
            return sorted(str(item).zfill(2) for item in value)
        if isinstance(value, str) and value:
            return [str(value).zfill(2)]
        return []

    def normalize_draw(self, draw: dict[str, Any], lottery_code: str = "dlt") -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code or draw.get("lottery_code"))
        blue_balls = self.normalize_blue_balls(draw.get("blue_balls", draw.get("blue_ball")))
        payload = {
            "lottery_code": normalized_code,
            "period": str(draw.get("period", "")),
            "red_balls": sorted(str(item).zfill(2) for item in draw.get("red_balls", [])),
            "blue_balls": blue_balls,
            "blue_ball": blue_balls[0] if blue_balls else None,
            "digits": normalize_digit_balls(draw.get("digits", [])),
            "date": draw.get("date", ""),
        }
        return payload

    def save_draws(self, draws: list[dict[str, Any]], lottery_code: str = "dlt") -> list[dict[str, Any]]:
        normalized_code = normalize_lottery_code(lottery_code)
        normalized = [self.normalize_draw(draw, normalized_code) for draw in draws]
        self.logger.info("Saving lottery draws", extra={"context": {"count": len(normalized)}})
        self.repository.upsert_draws(normalized, lottery_code=normalized_code)
        runtime_cache.invalidate_prefix(f"lottery:{normalized_code}:")
        return normalized

    def get_history_payload(self, limit: int | None = None, offset: int = 0, lottery_code: str = "dlt") -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        cache_key = f"lottery:{normalized_code}:history:{limit or 'all'}:{offset}"

        def load_payload() -> dict[str, Any]:
            draws = self.repository.list_draws(limit=limit, offset=offset, lottery_code=normalized_code)
            total_count = self.repository.count_draws(lottery_code=normalized_code)
            latest_draw = draws[0] if draws and offset == 0 else self.repository.get_latest_draw(lottery_code=normalized_code)
            last_updated = max(
                (draw.get("updated_at") for draw in draws if draw.get("updated_at")),
                default=datetime.utcnow(),
            )
            payload = {
                "lottery_code": normalized_code,
                "last_updated": last_updated.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "data": [self.normalize_draw(draw, normalized_code) for draw in draws],
                "total_count": total_count,
            }
            if latest_draw:
                payload["next_draw"] = get_lottery_definition(normalized_code).predict_next_draw(
                    latest_draw["period"],
                    latest_draw["date"],
                )
            self.logger.debug(
                "Built lottery history payload",
                extra={"context": {"limit": limit, "offset": offset, "returned_count": len(payload["data"])}},
            )
            return payload

        return runtime_cache.get_or_set(cache_key, ttl_seconds=120, loader=load_payload)

    def get_draw_by_period(self, period: str, lottery_code: str = "dlt") -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        draw = runtime_cache.get_or_set(
            f"lottery:{normalized_code}:period:{period}",
            ttl_seconds=120,
            loader=lambda: self.repository.get_draw_by_period(period, lottery_code=normalized_code),
        )
        return self.normalize_draw(draw, normalized_code) if draw else None

    def get_recent_draws(self, limit: int = 30, lottery_code: str = "dlt") -> list[dict[str, Any]]:
        normalized_code = normalize_lottery_code(lottery_code)
        return runtime_cache.get_or_set(
            f"lottery:{normalized_code}:recent:{limit}",
            ttl_seconds=120,
            loader=lambda: [self.normalize_draw(draw, normalized_code) for draw in self.repository.list_draws(limit=limit, lottery_code=normalized_code)],
        )
