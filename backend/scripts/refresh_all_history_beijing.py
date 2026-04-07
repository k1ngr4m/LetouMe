from __future__ import annotations

from backend.app.db.connection import ensure_schema
from backend.app.lotteries import SUPPORTED_LOTTERY_CODES, normalize_lottery_code
from backend.app.logging_utils import get_logger
from backend.app.repositories.model_repository import ModelRepository
from backend.app.services.lottery_fetch_service import LotteryFetchService
from backend.app.services.lottery_service import LotteryService
from backend.app.services.prediction_generation_service import PredictionGenerationService


logger = get_logger("scripts.refresh_all_history_beijing")


def main() -> None:
    ensure_schema()
    lottery_service = LotteryService()
    prediction_generation_service = PredictionGenerationService(lottery_service=lottery_service)
    model_repository = ModelRepository()
    active_model_codes = sorted(model_repository.list_active_model_codes())

    for lottery_code in SUPPORTED_LOTTERY_CODES:
        normalized_code = normalize_lottery_code(lottery_code)
        fetch_summary = LotteryFetchService(lottery_code=normalized_code).fetch_and_save(limit=5000)
        logger.info("History fetch complete", extra={"context": {"lottery_code": normalized_code, **fetch_summary}})

        history_payload = lottery_service.get_history_payload(lottery_code=normalized_code)
        periods = sorted({str(item.get("period") or "") for item in history_payload.get("data", []) if str(item.get("period") or "").isdigit()})
        if len(periods) < 2 or not active_model_codes:
            continue

        summary = prediction_generation_service.generate_for_models(
            lottery_code=normalized_code,
            model_codes=active_model_codes,
            mode="history",
            overwrite=True,
            start_period=periods[1],
            end_period=periods[-1],
            parallelism=min(3, len(active_model_codes)),
        )
        logger.info("History prediction refresh complete", extra={"context": {"lottery_code": normalized_code, **summary}})


if __name__ == "__main__":
    main()
