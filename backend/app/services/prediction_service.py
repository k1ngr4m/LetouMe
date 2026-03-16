from __future__ import annotations

from typing import Any

from backend.app.cache import runtime_cache
from backend.app.logging_utils import get_logger
from backend.app.repositories.prediction_repository import PredictionRepository
from backend.app.services.lottery_service import LotteryService


class PredictionService:
    def __init__(
        self,
        prediction_repository: PredictionRepository | None = None,
        lottery_service: LotteryService | None = None,
    ) -> None:
        self.prediction_repository = prediction_repository or PredictionRepository()
        self.lottery_service = lottery_service or LotteryService()
        self.logger = get_logger("services.prediction")

    @staticmethod
    def normalize_blue_balls(value: Any) -> list[str]:
        if isinstance(value, list):
            return sorted(str(item).zfill(2) for item in value)
        if isinstance(value, str) and value:
            return [str(value).zfill(2)]
        return []

    def normalize_prediction(self, prediction: dict[str, Any]) -> dict[str, Any]:
        normalized_predictions = []
        for group in prediction.get("predictions", []):
            blue_balls = self.normalize_blue_balls(group.get("blue_balls", group.get("blue_ball")))
            normalized_predictions.append(
                {
                    **group,
                    "red_balls": sorted(str(item).zfill(2) for item in group.get("red_balls", [])),
                    "blue_balls": blue_balls,
                    "blue_ball": blue_balls[0] if blue_balls else None,
                }
            )

        return {
            **prediction,
            "predictions": normalized_predictions,
        }

    def get_current_payload(self) -> dict[str, Any]:
        payload = runtime_cache.get_or_set(
            "predictions:current",
            ttl_seconds=60,
            loader=lambda: self.prediction_repository.get_current_prediction() or {
                "prediction_date": "",
                "target_period": "",
                "models": [],
            },
        )
        self.logger.debug("Loaded current prediction payload", extra={"context": {"target_period": payload.get("target_period"), "model_count": len(payload.get("models", []))}})
        return payload

    def get_current_payload_by_period(self, target_period: str) -> dict[str, Any]:
        return runtime_cache.get_or_set(
            f"predictions:current:{target_period}",
            ttl_seconds=60,
            loader=lambda: self.prediction_repository.get_current_prediction_by_period(target_period) or {
                "prediction_date": "",
                "target_period": target_period,
                "models": [],
            },
        )

    def get_history_payload(self, limit: int | None = None, offset: int = 0) -> dict[str, Any]:
        return runtime_cache.get_or_set(
            f"predictions:history:full:{limit or 'all'}:{offset}",
            ttl_seconds=60,
            loader=lambda: {
                "predictions_history": self.prediction_repository.list_history_records(limit=limit, offset=offset),
                "total_count": self.prediction_repository.count_history_records(),
            },
        )

    def get_history_list_payload(self, limit: int | None = None, offset: int = 0) -> dict[str, Any]:
        payload = runtime_cache.get_or_set(
            f"predictions:history:list:{limit or 'all'}:{offset}",
            ttl_seconds=60,
            loader=lambda: {
                "predictions_history": self.prediction_repository.list_history_record_summaries(limit=limit, offset=offset),
                "total_count": self.prediction_repository.count_history_records(),
            },
        )
        self.logger.info(
            "Loaded prediction history summaries",
            extra={"context": {"limit": limit, "offset": offset, "returned_count": len(payload["predictions_history"])}},
        )
        return payload

    def get_history_detail_payload(self, target_period: str) -> dict[str, Any] | None:
        payload = runtime_cache.get_or_set(
            f"predictions:history:detail:{target_period}",
            ttl_seconds=60,
            loader=lambda: self.prediction_repository.get_history_record_detail(target_period),
        )
        self.logger.info(
            "Loaded prediction history detail",
            extra={"context": {"target_period": target_period, "found": bool(payload)}},
        )
        return payload

    def get_current_detail_payload(self, target_period: str) -> dict[str, Any] | None:
        payload = self.get_current_payload_by_period(target_period)
        if not payload.get("target_period") or payload.get("target_period") != target_period:
            return None
        return payload

    def get_settings_record_list_payload(self) -> dict[str, Any]:
        current_payload = self.get_current_payload()
        history_payload = self.get_history_list_payload()
        records: list[dict[str, Any]] = []

        if current_payload.get("target_period"):
            records.append(
                {
                    "record_type": "current",
                    "target_period": current_payload.get("target_period", ""),
                    "prediction_date": current_payload.get("prediction_date", ""),
                    "actual_result": None,
                    "model_count": len(current_payload.get("models", [])),
                    "status_label": "待开奖",
                }
            )

        for record in history_payload.get("predictions_history", []):
            records.append(
                {
                    "record_type": "history",
                    "target_period": record.get("target_period", ""),
                    "prediction_date": record.get("prediction_date", ""),
                    "actual_result": record.get("actual_result"),
                    "model_count": len(record.get("models", [])),
                    "status_label": "已归档",
                }
            )

        records.sort(key=lambda item: (0 if item["record_type"] == "current" else 1, str(item["target_period"])), reverse=False)
        if records and any(item["record_type"] == "history" for item in records[1:]):
            history_records = [item for item in records if item["record_type"] == "history"]
            history_records.sort(key=lambda item: str(item["target_period"]), reverse=True)
            current_records = [item for item in records if item["record_type"] == "current"]
            records = current_records + history_records
        self.logger.info("Loaded settings prediction records", extra={"context": {"record_count": len(records)}})
        return {"records": records}

    def get_settings_record_detail_payload(self, record_type: str, target_period: str) -> dict[str, Any] | None:
        normalized_type = str(record_type or "").strip().lower()
        if normalized_type == "current":
            payload = self.get_current_detail_payload(target_period)
        elif normalized_type == "history":
            payload = self.get_history_detail_payload(target_period)
        else:
            raise ValueError("不支持的预测记录类型")

        if not payload:
            return None
        return {
            "record_type": normalized_type,
            "prediction_date": payload.get("prediction_date", ""),
            "target_period": payload.get("target_period", ""),
            "actual_result": payload.get("actual_result"),
            "models": payload.get("models", []),
        }

    def save_current_prediction(self, payload: dict[str, Any]) -> dict[str, Any]:
        target_period = str(payload.get("target_period") or "")
        current = self.get_current_payload_by_period(target_period) if target_period else self.get_current_payload()
        if current.get("target_period") == target_period:
            existing_model_map = {
                model.get("model_id"): model
                for model in current.get("models", [])
                if model.get("model_id")
            }
            for model in payload.get("models", []):
                existing_model_map[model.get("model_id")] = model

            payload = {
                **current,
                "prediction_date": payload.get("prediction_date", current.get("prediction_date")),
                "target_period": target_period or current.get("target_period"),
                "models": list(existing_model_map.values()),
            }

        self.prediction_repository.upsert_current_prediction(payload)
        self._invalidate_prediction_cache(target_period=target_period)
        self.logger.info(
            "Saved current prediction",
            extra={"context": {"target_period": payload.get("target_period"), "model_count": len(payload.get("models", []))}},
        )
        return payload

    def archive_current_prediction_if_needed(self, lottery_data: dict[str, Any]) -> None:
        old_predictions = self.prediction_repository.get_current_prediction()
        if not old_predictions:
            return

        old_target_period = str(old_predictions.get("target_period") or "")
        latest_period = str((lottery_data.get("data") or [{}])[0].get("period") or "")
        if not old_target_period or not latest_period or int(old_target_period) > int(latest_period):
            return

        if self.prediction_repository.history_record_exists(old_target_period):
            self.logger.debug("Archive skipped because history record already exists", extra={"context": {"target_period": old_target_period}})
            return

        actual_result = next(
            (draw for draw in lottery_data.get("data", []) if draw.get("period") == old_target_period),
            None,
        )
        if not actual_result:
            return

        models_with_hits = []
        for model_data in old_predictions.get("models", []):
            predictions_with_hits = []
            for pred_group in model_data.get("predictions", []):
                normalized_group = self.normalize_prediction({"predictions": [pred_group]}).get("predictions", [pred_group])[0]
                pred_with_hit = dict(normalized_group)
                pred_with_hit["hit_result"] = self.calculate_hit_result(normalized_group, actual_result)
                predictions_with_hits.append(pred_with_hit)

            if not predictions_with_hits:
                continue

            best_pred = max(predictions_with_hits, key=lambda p: p["hit_result"]["total_hits"])
            models_with_hits.append(
                {
                    "model_id": model_data.get("model_id"),
                    "model_name": model_data.get("model_name"),
                    "model_provider": model_data.get("model_provider"),
                    "model_version": model_data.get("model_version"),
                    "model_tags": model_data.get("model_tags"),
                    "model_api_model": model_data.get("model_api_model"),
                    "predictions": predictions_with_hits,
                    "best_group": best_pred["group_id"],
                    "best_hit_count": best_pred["hit_result"]["total_hits"],
                }
            )

        new_record = {
            "prediction_date": old_predictions.get("prediction_date"),
            "target_period": old_target_period,
            "actual_result": actual_result,
            "models": models_with_hits,
        }
        self.prediction_repository.upsert_history_record(new_record)
        self._invalidate_prediction_cache(target_period=old_target_period)
        self.logger.info(
            "Archived current prediction into history",
            extra={"context": {"target_period": old_target_period, "model_count": len(models_with_hits)}},
        )

    @staticmethod
    def calculate_hit_result(prediction_group: dict[str, Any], actual_result: dict[str, Any]) -> dict[str, Any]:
        red_hits = [b for b in prediction_group["red_balls"] if b in actual_result["red_balls"]]
        blue_hits = [b for b in prediction_group["blue_balls"] if b in actual_result["blue_balls"]]
        return {
            "red_hits": red_hits,
            "red_hit_count": len(red_hits),
            "blue_hits": blue_hits,
            "blue_hit_count": len(blue_hits),
            "total_hits": len(red_hits) + len(blue_hits),
        }

    @staticmethod
    def _invalidate_prediction_cache(target_period: str | None = None) -> None:
        runtime_cache.delete("predictions:current")
        runtime_cache.invalidate_prefix("predictions:current:")
        runtime_cache.invalidate_prefix("predictions:history:full:")
        runtime_cache.invalidate_prefix("predictions:history:list:")
        if target_period:
            runtime_cache.delete(f"predictions:history:detail:{target_period}")
        else:
            runtime_cache.invalidate_prefix("predictions:history:detail:")
