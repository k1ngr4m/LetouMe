from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.repositories.model_repository import ModelRepository
from backend.app.repositories.prediction_repository import PredictionRepository
from backend.app.services.lottery_service import LotteryService
from backend.app.services.prediction_service import PredictionService
from backend.core.model_config import ModelDefinition, load_model_registry
from backend.core.model_factory import ModelFactory


DEFAULT_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "dlt_prompt2.0.md"
DEFAULT_CONTEXT_SIZE = 30


@dataclass
class GenerationSummary:
    mode: str
    model_code: str
    target_period: str | None = None
    processed_count: int = 0
    skipped_count: int = 0
    failed_count: int = 0
    failed_periods: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "model_code": self.model_code,
            "target_period": self.target_period,
            "processed_count": self.processed_count,
            "skipped_count": self.skipped_count,
            "failed_count": self.failed_count,
            "failed_periods": list(self.failed_periods or []),
        }


class PredictionGenerationService:
    def __init__(
        self,
        lottery_service: LotteryService | None = None,
        prediction_service: PredictionService | None = None,
        prediction_repository: PredictionRepository | None = None,
        model_repository: ModelRepository | None = None,
    ) -> None:
        self.lottery_service = lottery_service or LotteryService()
        self.prediction_service = prediction_service or PredictionService()
        self.prediction_repository = prediction_repository or PredictionRepository()
        self.model_repository = model_repository or ModelRepository()
        self.logger = get_logger("services.prediction_generation")

    def generate_current_for_model(
        self,
        *,
        model_code: str,
        overwrite: bool,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        ensure_schema()
        model_def = self._get_model_definition(model_code)
        prompt_template = self._load_prompt_template()
        lottery_data = self._load_lottery_history()
        self.prediction_service.archive_current_prediction_if_needed(lottery_data)
        next_draw = lottery_data.get("next_draw") or {}
        target_period = str(next_draw.get("next_period") or "")
        target_date = str(next_draw.get("next_date_display") or "")
        if not target_period:
            raise ValueError("无法确定下一期，不能生成当前期预测")

        current_payload = self.prediction_service.get_current_payload_by_period(target_period)
        existing_models = {
            str(model.get("model_id") or "")
            for model in current_payload.get("models", [])
            if model.get("model_id")
        }
        summary = GenerationSummary(mode="current", model_code=model_code, target_period=target_period, failed_periods=[])
        if model_code in existing_models and not overwrite:
            summary.skipped_count = 1
            if progress_callback:
                progress_callback(summary.to_dict())
            return summary.to_dict()

        history_context = (lottery_data.get("data") or [])[:DEFAULT_CONTEXT_SIZE]
        prediction_date = datetime.now().strftime("%Y-%m-%d")
        model = self._prepare_model(model_def)
        prediction = self._generate_prediction(
            model=model,
            model_def=model_def,
            prompt_template=prompt_template,
            target_period=target_period,
            prediction_date=prediction_date,
            history_context=history_context,
            target_date=target_date,
        )
        self.prediction_service.save_current_prediction(
            {
                "prediction_date": prediction_date,
                "target_period": target_period,
                "models": [prediction],
            }
        )
        summary.processed_count = 1
        if progress_callback:
            progress_callback(summary.to_dict())
        return summary.to_dict()

    def recalculate_history_for_model(
        self,
        *,
        model_code: str,
        start_period: str,
        end_period: str,
        overwrite: bool,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        ensure_schema()
        start_value = int(start_period)
        end_value = int(end_period)
        if start_value > end_value:
            raise ValueError("开始期号不能大于结束期号")

        model_def = self._get_model_definition(model_code)
        model = self._prepare_model(model_def)
        prompt_template = self._load_prompt_template()
        history_data = self._load_lottery_history()
        period_map = self._build_period_map(history_data)
        available_periods = {int(period) for period in period_map}
        sorted_periods_desc = sorted((int(period), period) for period in period_map)
        summary = GenerationSummary(mode="history", model_code=model_code, failed_periods=[])

        for period_int in range(start_value, end_value + 1):
            target_period = str(period_int)
            if period_int not in available_periods:
                summary.failed_count += 1
                summary.failed_periods.append(target_period)
                if progress_callback:
                    progress_callback(summary.to_dict())
                continue

            existing_record = self.prediction_repository.get_history_record_detail(target_period)
            existing_model_map = {
                str(item.get("model_id") or ""): item
                for item in (existing_record or {}).get("models", [])
                if item.get("model_id")
            }
            if model_code in existing_model_map and not overwrite:
                summary.skipped_count += 1
                if progress_callback:
                    progress_callback(summary.to_dict())
                continue

            actual_result = period_map[target_period]
            history_context = [
                period_map[period]
                for period_int_value, period in sorted(sorted_periods_desc, reverse=True)
                if period_int_value < period_int
            ][:DEFAULT_CONTEXT_SIZE]
            if not history_context:
                summary.failed_count += 1
                summary.failed_periods.append(target_period)
                if progress_callback:
                    progress_callback(summary.to_dict())
                continue

            prediction_date = self._make_prediction_date(actual_result.get("date"))
            try:
                prediction = self._generate_prediction(
                    model=model,
                    model_def=model_def,
                    prompt_template=prompt_template,
                    target_period=target_period,
                    prediction_date=prediction_date,
                    history_context=history_context,
                )
            except Exception:
                summary.failed_count += 1
                summary.failed_periods.append(target_period)
                self.logger.exception(
                    "Historical prediction generation failed",
                    extra={"context": {"target_period": target_period, "model_code": model_code}},
                )
                if progress_callback:
                    progress_callback(summary.to_dict())
                continue

            predictions_with_hits = []
            for group in prediction.get("predictions", []):
                group_payload = dict(group)
                group_payload["hit_result"] = self.prediction_service.calculate_hit_result(group, actual_result)
                predictions_with_hits.append(group_payload)

            best_group = max(predictions_with_hits, key=lambda item: item["hit_result"]["total_hits"])
            existing_model_map[model_code] = {
                "model_id": prediction.get("model_id"),
                "model_name": prediction.get("model_name"),
                "model_provider": prediction.get("model_provider"),
                "model_version": prediction.get("model_version"),
                "model_tags": prediction.get("model_tags"),
                "model_api_model": prediction.get("model_api_model"),
                "predictions": predictions_with_hits,
                "best_group": best_group.get("group_id"),
                "best_hit_count": best_group["hit_result"]["total_hits"],
            }
            record = existing_record or {
                "prediction_date": prediction_date,
                "target_period": target_period,
                "actual_result": actual_result,
                "models": [],
            }
            record["prediction_date"] = prediction_date
            record["actual_result"] = actual_result
            record["models"] = list(existing_model_map.values())
            self.prediction_repository.upsert_history_record(record)
            self.prediction_service._invalidate_prediction_cache(target_period=target_period)
            summary.processed_count += 1
            if progress_callback:
                progress_callback(summary.to_dict())

        return summary.to_dict()

    def _prepare_model(self, model_def: ModelDefinition) -> Any:
        model = ModelFactory().create(model_def)
        ok, message = model.health_check()
        if not ok:
            raise ValueError(f"模型健康检查失败: {message}")
        return model

    def validate_model(self, model_code: str) -> dict[str, Any]:
        model = self.model_repository.get_model(model_code)
        if not model:
            raise KeyError(model_code)
        if bool(model.get("is_deleted")):
            raise ValueError("已删除模型不能生成预测数据")
        return model

    def _get_model_definition(self, model_code: str) -> ModelDefinition:
        self.validate_model(model_code)
        registry = load_model_registry()
        try:
            return registry.get(model_code)
        except KeyError as exc:
            raise KeyError(model_code) from exc

    @staticmethod
    def _load_prompt_template() -> str:
        return DEFAULT_PROMPT_PATH.read_text(encoding="utf-8")

    def _load_lottery_history(self) -> dict[str, Any]:
        data = self.lottery_service.get_history_payload()
        return {
            **data,
            "data": [self._normalize_draw(draw) for draw in data.get("data", [])],
        }

    @staticmethod
    def _normalize_blue_balls(value: Any) -> list[str]:
        if isinstance(value, list):
            return sorted(str(item).zfill(2) for item in value)
        if isinstance(value, str) and value:
            return [str(value).zfill(2)]
        return []

    @classmethod
    def _normalize_draw(cls, draw: dict[str, Any]) -> dict[str, Any]:
        blue_balls = cls._normalize_blue_balls(draw.get("blue_balls", draw.get("blue_ball")))
        return {
            **draw,
            "red_balls": sorted(str(item).zfill(2) for item in draw.get("red_balls", [])),
            "blue_balls": blue_balls,
            "blue_ball": blue_balls[0] if blue_balls else None,
        }

    def _generate_prediction(
        self,
        *,
        model: Any,
        model_def: ModelDefinition,
        prompt_template: str,
        target_period: str,
        prediction_date: str,
        history_context: list[dict[str, Any]],
        target_date: str = "",
    ) -> dict[str, Any]:
        prompt = prompt_template.format(
            target_period=target_period,
            target_date=target_date,
            lottery_history=json.dumps(history_context, ensure_ascii=False, indent=2),
            prediction_date=prediction_date,
            model_id=model_def.model_id,
            model_name=model_def.name,
        )
        raw_prediction = model.predict(prompt)
        prediction = self._finalize_prediction(raw_prediction, model_def, prediction_date, target_period)
        if not self._validate_prediction(prediction):
            raise ValueError(f"模型返回的预测结构无效: {model_def.model_id}")
        return prediction

    def _finalize_prediction(
        self,
        prediction: dict[str, Any],
        model_def: ModelDefinition,
        prediction_date: str,
        target_period: str,
    ) -> dict[str, Any]:
        normalized = self.prediction_service.normalize_prediction(prediction)
        normalized["prediction_date"] = prediction_date
        normalized["target_period"] = target_period
        normalized["model_id"] = model_def.model_id
        normalized["model_name"] = model_def.name
        normalized["model_provider"] = model_def.provider
        normalized["model_version"] = model_def.version
        normalized["model_tags"] = model_def.tags
        normalized["model_api_model"] = model_def.api_model
        return normalized

    def _validate_prediction(self, prediction: dict[str, Any]) -> bool:
        groups = prediction.get("predictions", [])
        if len(groups) != 5:
            return False
        for group in groups:
            red_balls = group.get("red_balls", [])
            blue_balls = self._normalize_blue_balls(group.get("blue_balls", group.get("blue_ball")))
            if len(red_balls) != 5 or red_balls != sorted(red_balls):
                return False
            if len(blue_balls) != 2 or blue_balls != sorted(blue_balls):
                return False
        return True

    @classmethod
    def _build_period_map(cls, history_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        for row in history_data.get("data", []):
            period = str(row["period"])
            result[period] = {
                "period": period,
                "red_balls": sorted(str(item).zfill(2) for item in row.get("red_balls", [])),
                "blue_balls": cls._normalize_blue_balls(row.get("blue_balls", row.get("blue_ball"))),
                "date": row.get("date"),
            }
        return result

    @staticmethod
    def _make_prediction_date(target_draw_date: str | None) -> str:
        if not target_draw_date:
            return datetime.now().strftime("%Y-%m-%d")
        return (datetime.strptime(target_draw_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
