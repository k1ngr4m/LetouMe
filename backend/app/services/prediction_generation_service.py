from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Any, Callable

from backend.app.db.connection import ensure_schema
from backend.app.lotteries import normalize_digit_balls, normalize_group_digits, normalize_lottery_code
from backend.app.logging_utils import get_logger
from backend.app.repositories.model_repository import ModelRepository
from backend.app.repositories.prediction_repository import PredictionRepository
from backend.app.services.lottery_service import LotteryService
from backend.app.services.prediction_service import PredictionService
from backend.core.model_config import ModelDefinition, load_model_registry
from backend.core.model_factory import ModelFactory


DEFAULT_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "dlt_prompt2.0.md"
PL3_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "pl3_prompt.md"
DEFAULT_CONTEXT_SIZE = 30
DEFAULT_BULK_PARALLELISM = 3
MAX_BULK_RETRIES_PER_MODEL = 1


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
        lottery_code: str = "dlt",
        model_code: str,
        overwrite: bool,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        ensure_schema()
        normalized_code = normalize_lottery_code(lottery_code)
        model_def = self._get_model_definition(model_code, lottery_code=normalized_code)
        prompt_template = self._load_prompt_template(normalized_code)
        lottery_data = self._load_lottery_history(normalized_code)
        self.prediction_service.archive_current_prediction_if_needed(lottery_data, lottery_code=normalized_code)
        next_draw = lottery_data.get("next_draw") or {}
        target_period = str(next_draw.get("next_period") or "")
        target_date = str(next_draw.get("next_date_display") or "")
        if not target_period:
            raise ValueError("无法确定下一期，不能生成当前期预测")

        current_payload = self.prediction_service.get_current_payload_by_period(target_period, lottery_code=normalized_code)
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
            lottery_code=normalized_code,
            prompt_template=prompt_template,
            target_period=target_period,
            prediction_date=prediction_date,
            history_context=history_context,
            target_date=target_date,
        )
        self.prediction_service.save_current_prediction(
            {
                "lottery_code": normalized_code,
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
        lottery_code: str = "dlt",
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

        normalized_code = normalize_lottery_code(lottery_code)
        model_def = self._get_model_definition(model_code, lottery_code=normalized_code)
        model = self._prepare_model(model_def)
        prompt_template = self._load_prompt_template(normalized_code)
        history_data = self._load_lottery_history(normalized_code)
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

            existing_record = self.prediction_repository.get_history_record_detail(target_period, lottery_code=normalized_code)
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
                    lottery_code=normalized_code,
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
                group_payload["hit_result"] = self.prediction_service.calculate_hit_result(group, actual_result, lottery_code=normalized_code)
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
                "lottery_code": normalized_code,
                "target_period": target_period,
                "actual_result": actual_result,
                "models": [],
            }
            record["prediction_date"] = prediction_date
            record["actual_result"] = actual_result
            record["models"] = list(existing_model_map.values())
            self.prediction_repository.upsert_history_record(record)
            self.prediction_service._invalidate_prediction_cache(target_period=target_period, lottery_code=normalized_code)
            summary.processed_count += 1
            if progress_callback:
                progress_callback(summary.to_dict())

        return summary.to_dict()

    def generate_for_models(
        self,
        *,
        lottery_code: str = "dlt",
        model_codes: list[str],
        mode: str,
        overwrite: bool,
        parallelism: int | None = None,
        start_period: str | None = None,
        end_period: str | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        normalized_codes = [str(code).strip() for code in model_codes if str(code).strip()]
        unique_codes = list(dict.fromkeys(normalized_codes))
        if not unique_codes:
            raise ValueError("请选择至少一个模型")
        if mode not in {"current", "history"}:
            raise ValueError("不支持的生成模式")
        if mode == "history" and (not start_period or not end_period):
            raise ValueError("历史重算必须提供开始期号和结束期号")
        max_workers = self._normalize_bulk_parallelism(parallelism, selected_count=len(unique_codes))

        summary = {
            "mode": mode,
            "model_code": "__bulk__",
            "selected_count": len(unique_codes),
            "completed_count": 0,
            "processed_count": 0,
            "skipped_count": 0,
            "failed_count": 0,
            "parallelism": max_workers,
            "retry_per_model": MAX_BULK_RETRIES_PER_MODEL,
            "processed_models": [],
            "skipped_models": [],
            "failed_models": [],
            "failed_details": [],
        }
        outcomes: dict[str, dict[str, str]] = {}
        outcomes_lock = Lock()

        def rebuild_summary_snapshot() -> dict[str, Any]:
            processed_models = [code for code in unique_codes if outcomes.get(code, {}).get("status") == "processed"]
            skipped_models = [code for code in unique_codes if outcomes.get(code, {}).get("status") == "skipped"]
            failed_models = [code for code in unique_codes if outcomes.get(code, {}).get("status") == "failed"]
            failed_details = [
                self._build_failed_detail(code, outcomes.get(code, {}).get("reason") or "未知错误")
                for code in failed_models
            ]
            summary["processed_models"] = processed_models
            summary["skipped_models"] = skipped_models
            summary["failed_models"] = failed_models
            summary["failed_details"] = failed_details
            summary["processed_count"] = len(processed_models)
            summary["skipped_count"] = len(skipped_models)
            summary["failed_count"] = len(failed_models)
            summary["completed_count"] = len(outcomes)
            return dict(summary)

        def run_single_model(model_code: str) -> tuple[str, str]:
            attempts = MAX_BULK_RETRIES_PER_MODEL + 1
            last_reason = "模型未生成结果"
            for attempt in range(1, attempts + 1):
                try:
                    result = (
                        self.generate_current_for_model(
                            lottery_code=lottery_code,
                            model_code=model_code,
                            overwrite=overwrite,
                        )
                        if mode == "current"
                        else self.recalculate_history_for_model(
                            lottery_code=lottery_code,
                            model_code=model_code,
                            start_period=str(start_period or ""),
                            end_period=str(end_period or ""),
                            overwrite=overwrite,
                        )
                    )
                    status, reason = self._classify_bulk_model_result(result)
                    if status in {"processed", "skipped"}:
                        return status, reason
                    last_reason = reason
                except Exception as exc:
                    last_reason = str(exc) or "未知错误"
                    self.logger.exception(
                        "Bulk prediction generation failed",
                        extra={"context": {"model_code": model_code, "mode": mode, "attempt": attempt}},
                    )
                if attempt < attempts:
                    self.logger.warning(
                        "Bulk prediction generation retrying model",
                        extra={
                            "context": {
                                "model_code": model_code,
                                "mode": mode,
                                "next_attempt": attempt + 1,
                                "reason": last_reason,
                            }
                        },
                    )
            return "failed", last_reason

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(run_single_model, model_code): model_code
                for model_code in unique_codes
            }
            for future in as_completed(futures):
                model_code = futures[future]
                try:
                    status, reason = future.result()
                except Exception as exc:
                    status, reason = "failed", str(exc) or "未知错误"
                    self.logger.exception(
                        "Bulk prediction generation worker crashed",
                        extra={"context": {"model_code": model_code, "mode": mode}},
                    )
                with outcomes_lock:
                    outcomes[model_code] = {"status": status, "reason": reason}
                    snapshot = rebuild_summary_snapshot()
                if progress_callback:
                    progress_callback(snapshot)

        return summary

    @staticmethod
    def _build_failed_detail(model_code: str, reason: str) -> dict[str, str]:
        return {
            "model_code": model_code,
            "reason": reason or "未知错误",
        }

    @staticmethod
    def _classify_bulk_model_result(result: dict[str, Any]) -> tuple[str, str]:
        if result.get("processed_count", 0) > 0:
            return "processed", ""
        if result.get("skipped_count", 0) > 0:
            return "skipped", ""
        return "failed", "模型未生成结果"

    @staticmethod
    def _normalize_bulk_parallelism(parallelism: int | None, *, selected_count: int) -> int:
        if selected_count <= 0:
            return 1
        if parallelism is None:
            requested = DEFAULT_BULK_PARALLELISM
        else:
            requested = int(parallelism)
            if requested < 1:
                raise ValueError("并发数必须大于 0")
        return max(1, min(requested, selected_count))

    def _prepare_model(self, model_def: ModelDefinition) -> Any:
        model = ModelFactory().create(model_def)
        ok, message = model.health_check()
        if not ok:
            raise ValueError(f"模型健康检查失败: {message}")
        return model

    def validate_model(self, model_code: str, lottery_code: str = "dlt") -> dict[str, Any]:
        model = self.model_repository.get_model(model_code)
        if not model:
            raise KeyError(model_code)
        if bool(model.get("is_deleted")):
            raise ValueError("已删除模型不能生成预测数据")
        normalized_code = normalize_lottery_code(lottery_code)
        if normalized_code not in (model.get("lottery_codes") or ["dlt"]):
            raise ValueError("该模型未配置当前彩种")
        return model

    def _get_model_definition(self, model_code: str, lottery_code: str = "dlt") -> ModelDefinition:
        self.validate_model(model_code, lottery_code=lottery_code)
        registry = load_model_registry()
        try:
            model_def = registry.get(model_code)
            if not model_def.supports_lottery(lottery_code):
                raise ValueError("该模型未配置当前彩种")
            return model_def
        except KeyError as exc:
            raise KeyError(model_code) from exc

    @staticmethod
    def _load_prompt_template(lottery_code: str = "dlt") -> str:
        path = DEFAULT_PROMPT_PATH if normalize_lottery_code(lottery_code) == "dlt" else PL3_PROMPT_PATH
        return path.read_text(encoding="utf-8")

    def _load_lottery_history(self, lottery_code: str = "dlt") -> dict[str, Any]:
        data = self.lottery_service.get_history_payload(lottery_code=lottery_code)
        return {
            **data,
            "data": [self._normalize_draw(draw, lottery_code=lottery_code) for draw in data.get("data", [])],
        }

    @staticmethod
    def _normalize_blue_balls(value: Any) -> list[str]:
        if isinstance(value, list):
            return sorted(str(item).zfill(2) for item in value)
        if isinstance(value, str) and value:
            return [str(value).zfill(2)]
        return []

    @classmethod
    def _normalize_draw(cls, draw: dict[str, Any], lottery_code: str = "dlt") -> dict[str, Any]:
        blue_balls = cls._normalize_blue_balls(draw.get("blue_balls", draw.get("blue_ball")))
        return {
            **draw,
            "red_balls": sorted(str(item).zfill(2) for item in draw.get("red_balls", [])),
            "blue_balls": blue_balls,
            "blue_ball": blue_balls[0] if blue_balls else None,
            "digits": normalize_digit_balls(draw.get("digits", [])),
            "lottery_code": normalize_lottery_code(lottery_code or draw.get("lottery_code")),
        }

    def _generate_prediction(
        self,
        *,
        model: Any,
        model_def: ModelDefinition,
        lottery_code: str,
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
        self.logger.info(
            "Prediction generation started",
            extra={
                "context": {
                    "lottery_code": lottery_code,
                    "target_period": target_period,
                    "model_code": model_def.model_id,
                    "model_provider": model_def.provider,
                    "history_context_count": len(history_context),
                    "prompt_length": len(prompt),
                }
            },
        )
        try:
            raw_prediction = model.predict(prompt)
        except Exception:
            self.logger.exception(
                "Model prediction request failed",
                extra={
                    "context": {
                        "lottery_code": lottery_code,
                        "target_period": target_period,
                        "model_code": model_def.model_id,
                        "model_provider": model_def.provider,
                    }
                },
            )
            raise
        raw_summary = self._build_prediction_payload_summary(raw_prediction)
        raw_preview = self._build_payload_preview(raw_prediction)
        self.logger.info(
            "Model returned prediction payload",
            extra={
                "context": {
                    "lottery_code": lottery_code,
                    "target_period": target_period,
                    "model_code": model_def.model_id,
                    "response_group_count": raw_summary["group_count"],
                    "response_description_count": raw_summary["description_count"],
                    "response_strategy_count": raw_summary["strategy_count"],
                    "response_play_types": raw_summary["play_types"],
                    "response_preview": raw_preview,
                }
            },
        )
        try:
            prediction = self._finalize_prediction(raw_prediction, model_def, prediction_date, target_period, lottery_code=lottery_code)
        except Exception:
            self.logger.exception(
                "Model prediction normalization failed",
                extra={
                    "context": {
                        "lottery_code": lottery_code,
                        "target_period": target_period,
                        "model_code": model_def.model_id,
                        "response_preview": raw_preview,
                    }
                },
            )
            raise
        if not self._validate_prediction(prediction, lottery_code=lottery_code):
            normalized_summary = self._build_prediction_payload_summary(prediction)
            normalized_preview = self._build_payload_preview(prediction)
            self.logger.warning(
                "Model prediction validation failed",
                extra={
                    "context": {
                        "lottery_code": lottery_code,
                        "target_period": target_period,
                        "model_code": model_def.model_id,
                        "response_group_count": normalized_summary["group_count"],
                        "response_play_types": normalized_summary["play_types"],
                        "response_preview": normalized_preview,
                    }
                },
            )
            raise ValueError(f"模型返回的预测结构无效: {model_def.model_id}")
        normalized_summary = self._build_prediction_payload_summary(prediction)
        self.logger.info(
            "Prediction generation completed",
            extra={
                "context": {
                    "lottery_code": lottery_code,
                    "target_period": target_period,
                    "model_code": model_def.model_id,
                    "normalized_group_count": normalized_summary["group_count"],
                    "normalized_description_count": normalized_summary["description_count"],
                    "normalized_strategy_count": normalized_summary["strategy_count"],
                    "normalized_play_types": normalized_summary["play_types"],
                }
            },
        )
        return prediction

    @staticmethod
    def _build_payload_preview(payload: Any, limit: int = 1200) -> str:
        if isinstance(payload, (dict, list)):
            text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        else:
            text = str(payload)
        compact = " ".join(text.split())
        if len(compact) <= limit:
            return compact
        return f"{compact[:limit]}...(truncated,{len(compact)} chars)"

    @staticmethod
    def _build_prediction_payload_summary(payload: Any) -> dict[str, Any]:
        if not isinstance(payload, dict):
            return {
                "group_count": 0,
                "description_count": 0,
                "strategy_count": 0,
                "play_types": "-",
            }
        groups = payload.get("predictions")
        if not isinstance(groups, list):
            return {
                "group_count": 0,
                "description_count": 0,
                "strategy_count": 0,
                "play_types": "-",
            }
        description_count = sum(
            1
            for group in groups
            if isinstance(group, dict) and str(group.get("description") or "").strip()
        )
        strategy_count = sum(
            1
            for group in groups
            if isinstance(group, dict) and str(group.get("strategy") or "").strip()
        )
        play_types = sorted(
            {
                str(group.get("play_type") or "").strip().lower()
                for group in groups
                if isinstance(group, dict) and str(group.get("play_type") or "").strip()
            }
        )
        return {
            "group_count": len(groups),
            "description_count": description_count,
            "strategy_count": strategy_count,
            "play_types": ",".join(play_types) if play_types else "-",
        }

    def _finalize_prediction(
        self,
        prediction: dict[str, Any],
        model_def: ModelDefinition,
        prediction_date: str,
        target_period: str,
        lottery_code: str = "dlt",
    ) -> dict[str, Any]:
        normalized = self.prediction_service.normalize_prediction(prediction, lottery_code=lottery_code)
        normalized["prediction_date"] = prediction_date
        normalized["target_period"] = target_period
        normalized["lottery_code"] = normalize_lottery_code(lottery_code)
        normalized["model_id"] = model_def.model_id
        normalized["model_name"] = model_def.name
        normalized["model_provider"] = model_def.provider
        normalized["model_version"] = model_def.version
        normalized["model_tags"] = model_def.tags
        normalized["model_api_model"] = model_def.api_model
        return normalized

    def _validate_prediction(self, prediction: dict[str, Any], lottery_code: str = "dlt") -> bool:
        groups = prediction.get("predictions", [])
        normalized_code = normalize_lottery_code(lottery_code)
        if len(groups) != 5:
            return False
        for group in groups:
            if normalized_code == "pl3":
                play_type = str(group.get("play_type") or "").strip().lower()
                digits = normalize_digit_balls(group.get("digits", []))
                if play_type not in {"direct", "group3", "group6"}:
                    return False
                if len(digits) != 3:
                    return False
                if play_type == "group3" and len(set(digits)) != 2:
                    return False
                if play_type == "group6" and len(set(digits)) != 3:
                    return False
                continue
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
                "digits": normalize_digit_balls(row.get("digits", [])),
                "lottery_code": row.get("lottery_code", "dlt"),
                "date": row.get("date"),
            }
        return result

    @staticmethod
    def _make_prediction_date(target_draw_date: str | None) -> str:
        if not target_draw_date:
            return datetime.now().strftime("%Y-%m-%d")
        return (datetime.strptime(target_draw_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
