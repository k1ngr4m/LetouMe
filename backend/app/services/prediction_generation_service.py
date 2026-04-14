from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from threading import Lock, local
from time import monotonic
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
PL3_SUM_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "pl3_sum_prompt.md"
PL3_DANTUO_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "pl3_dantuo_prompt.md"
PL5_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "pl5_prompt.md"
QXC_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "qxc_prompt.md"
QXC_COMPOUND_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "qxc_compound_prompt.md"
DLT_DANTUO_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "dlt_dantuo_prompt.md"
DLT_COMPOUND_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "dlt_compound_prompt.md"
DEFAULT_PROMPT_HISTORY_PERIOD_COUNT = 50
DEFAULT_BULK_PARALLELISM = 3
DEFAULT_SINGLE_MODEL_PARALLELISM = 3
MAX_GENERATION_PARALLELISM = 8
MAX_BULK_RETRIES_PER_MODEL = 1
MAX_INVALID_PREDICTION_RETRIES = 2
SUPPORTED_RECENT_PERIOD_COUNTS = {1, 5, 10, 20}
SUPPORTED_PROMPT_HISTORY_PERIOD_COUNTS = {30, 50, 100}
MODEL_REGISTRY_CACHE_TTL_SECONDS = 60
PROVIDER_FAILURE_COOLDOWN_SECONDS = 300


@dataclass
class GenerationSummary:
    mode: str
    model_code: str
    target_period: str | None = None
    parallelism: int | None = None
    processed_count: int = 0
    skipped_count: int = 0
    failed_count: int = 0
    failed_periods: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "model_code": self.model_code,
            "target_period": self.target_period,
            "parallelism": self.parallelism,
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
        self._model_registry_cache: tuple[float, Any] | None = None
        self._model_registry_lock = Lock()
        self._provider_failure_state: dict[str, tuple[int, float]] = {}
        self._provider_failure_lock = Lock()

    def generate_current_for_model(
        self,
        *,
        lottery_code: str = "dlt",
        model_code: str,
        prediction_play_mode: str = "direct",
        overwrite: bool,
        prompt_history_period_count: int | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        ensure_schema()
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_play_mode = self._normalize_prediction_play_mode(prediction_play_mode, lottery_code=normalized_code)
        normalized_prompt_history_period_count = self._normalize_prompt_history_period_count(prompt_history_period_count)
        model_def = self._get_model_definition(model_code, lottery_code=normalized_code)
        prompt_template = self._load_prompt_template(normalized_code, prediction_play_mode=normalized_play_mode)
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
            and self._prediction_matches_play_mode(
                model,
                lottery_code=normalized_code,
                prediction_play_mode=normalized_play_mode,
            )
        }
        summary = GenerationSummary(mode="current", model_code=model_code, target_period=target_period, parallelism=1, failed_periods=[])
        if model_code in existing_models and not overwrite:
            summary.skipped_count = 1
            if progress_callback:
                progress_callback(summary.to_dict())
            return summary.to_dict()

        history_context = (lottery_data.get("data") or [])[:normalized_prompt_history_period_count]
        prediction_date = datetime.now().strftime("%Y-%m-%d")
        model = self._prepare_model(model_def)
        prediction = self._generate_prediction(
            model=model,
            model_def=model_def,
            lottery_code=normalized_code,
            prediction_play_mode=normalized_play_mode,
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
        prediction_play_mode: str = "direct",
        start_period: str = "",
        end_period: str = "",
        recent_period_count: int | None = None,
        overwrite: bool,
        prompt_history_period_count: int | None = None,
        parallelism: int | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        ensure_schema()
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_play_mode = self._normalize_prediction_play_mode(prediction_play_mode, lottery_code=normalized_code)
        normalized_prompt_history_period_count = self._normalize_prompt_history_period_count(prompt_history_period_count)
        model_def = self._get_model_definition(model_code, lottery_code=normalized_code)
        prompt_template = self._load_prompt_template(normalized_code, prediction_play_mode=normalized_play_mode)
        history_data = self._load_lottery_history(normalized_code)
        start_period, end_period = self._resolve_history_period_range(
            history_data,
            start_period=start_period,
            end_period=end_period,
            recent_period_count=recent_period_count,
        )
        start_value = int(start_period)
        end_value = int(end_period)
        period_map = self._build_period_map(history_data)
        available_periods = {int(period) for period in period_map}
        sorted_periods_desc = sorted((int(period), period) for period in period_map)
        target_periods = list(range(start_value, end_value + 1))
        max_workers = self._normalize_single_model_parallelism(parallelism, period_count=len(target_periods))
        summary = GenerationSummary(mode="history", model_code=model_code, parallelism=max_workers, failed_periods=[])
        summary_lock = Lock()
        thread_local = local()
        pending_payloads: list[dict[str, Any]] = []

        def emit_progress_snapshot() -> None:
            if progress_callback:
                progress_callback(summary.to_dict())

        for period_int in target_periods:
            target_period = str(period_int)
            if period_int not in available_periods:
                with summary_lock:
                    summary.failed_count += 1
                    summary.failed_periods.append(target_period)
                    emit_progress_snapshot()
                continue

            existing_record = self.prediction_repository.get_history_record_detail(target_period, lottery_code=normalized_code)
            existing_model_map = {
                self._build_model_mode_key(
                    model_id=str(item.get("model_id") or ""),
                    prediction_play_mode=self._extract_model_play_mode(item, lottery_code=normalized_code),
                    lottery_code=normalized_code,
                ): item
                for item in (existing_record or {}).get("models", [])
                if item.get("model_id")
            }
            existing_model_payload = existing_model_map.get(
                self._build_model_mode_key(
                    model_id=model_code,
                    prediction_play_mode=normalized_play_mode,
                    lottery_code=normalized_code,
                )
            )
            if (
                existing_model_payload
                and self._prediction_matches_play_mode(
                    existing_model_payload,
                    lottery_code=normalized_code,
                    prediction_play_mode=normalized_play_mode,
                )
                and not overwrite
            ):
                with summary_lock:
                    summary.skipped_count += 1
                    emit_progress_snapshot()
                continue

            actual_result = period_map[target_period]
            history_context = [
                period_map[period]
                for period_int_value, period in sorted(sorted_periods_desc, reverse=True)
                if period_int_value < period_int
            ][:normalized_prompt_history_period_count]
            if not history_context:
                with summary_lock:
                    summary.failed_count += 1
                    summary.failed_periods.append(target_period)
                    emit_progress_snapshot()
                continue

            prediction_date = self._make_prediction_date(actual_result.get("date"))
            pending_payloads.append(
                {
                    "target_period": target_period,
                    "prediction_date": prediction_date,
                    "actual_result": actual_result,
                    "history_context": history_context,
                    "existing_record": existing_record,
                    "existing_model_map": existing_model_map,
                }
            )

        def get_thread_model() -> Any:
            cached_model = getattr(thread_local, "history_generation_model", None)
            if cached_model is not None:
                return cached_model
            prepared_model = self._prepare_model(model_def)
            thread_local.history_generation_model = prepared_model
            return prepared_model

        def run_period_generation(payload: dict[str, Any]) -> tuple[str, str, dict[str, Any] | None]:
            target_period = str(payload["target_period"])
            prediction_date = str(payload["prediction_date"])
            actual_result = dict(payload["actual_result"])
            history_context = list(payload["history_context"])
            existing_record = payload["existing_record"]
            existing_model_map = dict(payload["existing_model_map"])
            try:
                prediction = self._generate_prediction(
                    model=get_thread_model(),
                    model_def=model_def,
                    lottery_code=normalized_code,
                    prediction_play_mode=normalized_play_mode,
                    prompt_template=prompt_template,
                    target_period=target_period,
                    prediction_date=prediction_date,
                    history_context=history_context,
                )
            except Exception:
                self.logger.exception(
                    "Historical prediction generation failed",
                    extra={"context": {"target_period": target_period, "model_code": model_code}},
                )
                return "failed", target_period, None

            predictions_with_hits = []
            for group in prediction.get("predictions", []):
                group_payload = dict(group)
                group_payload["hit_result"] = self.prediction_service.calculate_hit_result(group, actual_result, lottery_code=normalized_code)
                predictions_with_hits.append(group_payload)

            best_group = max(predictions_with_hits, key=lambda item: item["hit_result"]["total_hits"])
            existing_model_map[
                self._build_model_mode_key(
                    model_id=str(prediction.get("model_id") or model_code),
                    prediction_play_mode=str(prediction.get("prediction_play_mode") or normalized_play_mode),
                    lottery_code=normalized_code,
                )
            ] = {
                "model_id": prediction.get("model_id"),
                "prediction_play_mode": str(prediction.get("prediction_play_mode") or normalized_play_mode),
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
            return "processed", target_period, record

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(run_period_generation, payload): str(payload["target_period"])
                for payload in pending_payloads
            }
            for future in as_completed(futures):
                target_period = futures[future]
                try:
                    status, target_period, record = future.result()
                except Exception:
                    status, record = "failed", None
                    self.logger.exception(
                        "Historical prediction generation worker crashed",
                        extra={"context": {"target_period": target_period, "model_code": model_code}},
                    )
                if status == "processed" and record is not None:
                    self.prediction_repository.upsert_history_record(record)
                    self.prediction_service._invalidate_prediction_cache(target_period=target_period, lottery_code=normalized_code)
                with summary_lock:
                    if status == "processed":
                        summary.processed_count += 1
                    else:
                        summary.failed_count += 1
                        summary.failed_periods.append(target_period)
                    emit_progress_snapshot()

        return summary.to_dict()

    def generate_for_models(
        self,
        *,
        lottery_code: str = "dlt",
        model_codes: list[str],
        mode: str,
        prediction_play_mode: str = "direct",
        overwrite: bool,
        prompt_history_period_count: int | None = None,
        parallelism: int | None = None,
        start_period: str | None = None,
        end_period: str | None = None,
        recent_period_count: int | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        normalized_codes = [str(code).strip() for code in model_codes if str(code).strip()]
        unique_codes = list(dict.fromkeys(normalized_codes))
        if not unique_codes:
            raise ValueError("请选择至少一个模型")
        if mode not in {"current", "history"}:
            raise ValueError("不支持的生成模式")
        if mode == "history" and not recent_period_count and (not start_period or not end_period):
            raise ValueError("历史重算必须提供开始期号和结束期号，或选择最近期数")
        normalized_prompt_history_period_count = self._normalize_prompt_history_period_count(prompt_history_period_count)

        summary = {
            "mode": mode,
            "model_code": "__bulk__",
            "selected_count": len(unique_codes),
            "completed_count": 0,
            "processed_count": 0,
            "skipped_count": 0,
            "failed_count": 0,
            "parallelism": 1,
            "retry_per_model": MAX_BULK_RETRIES_PER_MODEL,
            "task_total_count": 0,
            "task_completed_count": 0,
            "task_processed_count": 0,
            "task_skipped_count": 0,
            "task_failed_count": 0,
            "processed_models": [],
            "skipped_models": [],
            "failed_models": [],
            "failed_details": [],
        }
        if mode == "history":
            return self._generate_history_for_models_by_subtasks(
                lottery_code=lottery_code,
                unique_codes=unique_codes,
                overwrite=overwrite,
                prediction_play_mode=prediction_play_mode,
                prompt_history_period_count=normalized_prompt_history_period_count,
                parallelism=parallelism,
                start_period=str(start_period or ""),
                end_period=str(end_period or ""),
                recent_period_count=recent_period_count,
                progress_callback=progress_callback,
                summary=summary,
            )

        max_workers = self._normalize_bulk_parallelism(parallelism, selected_count=len(unique_codes))
        summary["parallelism"] = max_workers
        summary["task_total_count"] = len(unique_codes)
        outcomes: dict[str, dict[str, str]] = {}
        outcomes_lock = Lock()

        def run_single_model(model_code: str) -> tuple[str, str]:
            attempts = MAX_BULK_RETRIES_PER_MODEL + 1
            last_reason = "模型未生成结果"
            for attempt in range(1, attempts + 1):
                try:
                    result = (
                        self.generate_current_for_model(
                            lottery_code=lottery_code,
                            model_code=model_code,
                            prediction_play_mode=prediction_play_mode,
                            prompt_history_period_count=normalized_prompt_history_period_count,
                            overwrite=overwrite,
                        )
                        if mode == "current"
                        else self.recalculate_history_for_model(
                            lottery_code=lottery_code,
                            model_code=model_code,
                            prediction_play_mode=prediction_play_mode,
                            prompt_history_period_count=normalized_prompt_history_period_count,
                            start_period=str(start_period or ""),
                            end_period=str(end_period or ""),
                            recent_period_count=recent_period_count,
                            overwrite=overwrite,
                            parallelism=1,
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
                    snapshot = self._rebuild_bulk_summary_snapshot(
                        summary=summary,
                        unique_codes=unique_codes,
                        outcomes=outcomes,
                    )
                if progress_callback:
                    progress_callback(snapshot)

        return summary

    def _generate_history_for_models_by_subtasks(
        self,
        *,
        lottery_code: str,
        unique_codes: list[str],
        overwrite: bool,
        prediction_play_mode: str,
        prompt_history_period_count: int,
        parallelism: int | None,
        start_period: str,
        end_period: str,
        recent_period_count: int | None,
        progress_callback: Callable[[dict[str, Any]], None] | None,
        summary: dict[str, Any],
    ) -> dict[str, Any]:
        ensure_schema()
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_play_mode = self._normalize_prediction_play_mode(prediction_play_mode, lottery_code=normalized_code)
        history_data = self._load_lottery_history(normalized_code)
        start_period, end_period = self._resolve_history_period_range(
            history_data,
            start_period=start_period,
            end_period=end_period,
            recent_period_count=recent_period_count,
        )
        start_value = int(start_period)
        end_value = int(end_period)
        target_periods = [str(item) for item in range(start_value, end_value + 1)]
        summary["task_total_count"] = len(unique_codes) * len(target_periods)
        max_workers = self._normalize_bulk_parallelism(parallelism, selected_count=summary["task_total_count"])
        summary["parallelism"] = max_workers
        period_map = self._build_period_map(history_data)
        sorted_periods_desc = sorted((int(period), period) for period in period_map)
        model_defs = {model_code: self._get_model_definition(model_code, lottery_code=normalized_code) for model_code in unique_codes}
        prompt_templates = {
            model_code: self._load_prompt_template(normalized_code, prediction_play_mode=normalized_play_mode)
            for model_code in unique_codes
        }
        history_context_map: dict[str, list[dict[str, Any]]] = {}
        for period in target_periods:
            period_int = int(period)
            history_context_map[period] = [
                period_map[history_period]
                for period_int_value, history_period in sorted(sorted_periods_desc, reverse=True)
                if period_int_value < period_int
            ][:prompt_history_period_count]

        thread_local = local()
        period_locks: dict[str, Lock] = {}
        period_locks_lock = Lock()
        outcomes_lock = Lock()
        task_outcomes: dict[str, dict[str, str]] = {}
        model_failed_reason: dict[str, str] = {}

        def get_period_lock(period: str) -> Lock:
            with period_locks_lock:
                return period_locks.setdefault(period, Lock())

        def get_thread_model(model_code: str) -> Any:
            cached_models = getattr(thread_local, "bulk_history_models", None)
            if cached_models is None:
                cached_models = {}
                thread_local.bulk_history_models = cached_models
            if model_code in cached_models:
                return cached_models[model_code]
            prepared_model = self._prepare_model(model_defs[model_code])
            cached_models[model_code] = prepared_model
            return prepared_model

        def run_subtask(model_code: str, target_period: str) -> tuple[str, str]:
            task_key = f"{model_code}:{target_period}"
            actual_result = period_map.get(target_period)
            if not actual_result:
                return task_key, "failed:目标期不存在开奖历史"
            history_context = history_context_map.get(target_period) or []
            if not history_context:
                return task_key, "failed:历史上下文不足"

            with get_period_lock(target_period):
                current_record = self.prediction_repository.get_history_record_detail(target_period, lottery_code=normalized_code)
                current_model_map = {
                    self._build_model_mode_key(
                        model_id=str(item.get("model_id") or ""),
                        prediction_play_mode=self._extract_model_play_mode(item, lottery_code=normalized_code),
                        lottery_code=normalized_code,
                    ): item
                    for item in (current_record or {}).get("models", [])
                    if item.get("model_id")
                }
                existing_model_payload = current_model_map.get(
                    self._build_model_mode_key(
                        model_id=model_code,
                        prediction_play_mode=normalized_play_mode,
                        lottery_code=normalized_code,
                    )
                )
                if (
                    existing_model_payload
                    and self._prediction_matches_play_mode(
                        existing_model_payload,
                        lottery_code=normalized_code,
                        prediction_play_mode=normalized_play_mode,
                    )
                    and not overwrite
                ):
                    return task_key, "skipped"

            prediction_date = self._make_prediction_date(actual_result.get("date"))
            try:
                prediction = self._generate_prediction(
                    model=get_thread_model(model_code),
                    model_def=model_defs[model_code],
                    lottery_code=normalized_code,
                    prediction_play_mode=normalized_play_mode,
                    prompt_template=prompt_templates[model_code],
                    target_period=target_period,
                    prediction_date=prediction_date,
                    history_context=list(history_context),
                )
            except Exception as exc:
                self.logger.exception(
                    "Bulk historical prediction generation failed",
                    extra={"context": {"target_period": target_period, "model_code": model_code}},
                )
                return task_key, f"failed:{str(exc) or '未知错误'}"

            predictions_with_hits = []
            for group in prediction.get("predictions", []):
                group_payload = dict(group)
                group_payload["hit_result"] = self.prediction_service.calculate_hit_result(group, actual_result, lottery_code=normalized_code)
                predictions_with_hits.append(group_payload)
            best_group = max(predictions_with_hits, key=lambda item: item["hit_result"]["total_hits"])

            with get_period_lock(target_period):
                current_record = self.prediction_repository.get_history_record_detail(target_period, lottery_code=normalized_code)
                current_model_map = {
                    self._build_model_mode_key(
                        model_id=str(item.get("model_id") or ""),
                        prediction_play_mode=self._extract_model_play_mode(item, lottery_code=normalized_code),
                        lottery_code=normalized_code,
                    ): item
                    for item in (current_record or {}).get("models", [])
                    if item.get("model_id")
                }
                current_model_map[
                    self._build_model_mode_key(
                        model_id=str(prediction.get("model_id") or model_code),
                        prediction_play_mode=str(prediction.get("prediction_play_mode") or normalized_play_mode),
                        lottery_code=normalized_code,
                    )
                ] = {
                    "model_id": prediction.get("model_id"),
                    "prediction_play_mode": str(prediction.get("prediction_play_mode") or normalized_play_mode),
                    "model_name": prediction.get("model_name"),
                    "model_provider": prediction.get("model_provider"),
                    "model_version": prediction.get("model_version"),
                    "model_tags": prediction.get("model_tags"),
                    "model_api_model": prediction.get("model_api_model"),
                    "predictions": predictions_with_hits,
                    "best_group": best_group.get("group_id"),
                    "best_hit_count": best_group["hit_result"]["total_hits"],
                }
                record = current_record or {
                    "prediction_date": prediction_date,
                    "lottery_code": normalized_code,
                    "target_period": target_period,
                    "actual_result": actual_result,
                    "models": [],
                }
                record["prediction_date"] = prediction_date
                record["actual_result"] = actual_result
                record["models"] = list(current_model_map.values())
                self.prediction_repository.upsert_history_record(record)
                self.prediction_service._invalidate_prediction_cache(target_period=target_period, lottery_code=normalized_code)
            return task_key, "processed"

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(run_subtask, model_code, target_period): (model_code, target_period)
                for model_code in unique_codes
                for target_period in target_periods
            }
            for future in as_completed(futures):
                model_code, target_period = futures[future]
                task_key = f"{model_code}:{target_period}"
                try:
                    task_key, outcome = future.result()
                except Exception as exc:
                    outcome = f"failed:{str(exc) or '未知错误'}"
                    self.logger.exception(
                        "Bulk history prediction worker crashed",
                        extra={"context": {"target_period": target_period, "model_code": model_code}},
                    )
                with outcomes_lock:
                    task_outcomes[task_key] = {"status": outcome.split(":", 1)[0], "reason": outcome.split(":", 1)[1] if ":" in outcome else ""}
                    if outcome.startswith("failed:") and model_code not in model_failed_reason:
                        model_failed_reason[model_code] = outcome.split(":", 1)[1] or "未知错误"
                    snapshot = self._rebuild_bulk_history_summary_snapshot(
                        summary=summary,
                        unique_codes=unique_codes,
                        target_periods=target_periods,
                        task_outcomes=task_outcomes,
                        model_failed_reason=model_failed_reason,
                    )
                if progress_callback:
                    progress_callback(snapshot)
        return summary

    @staticmethod
    def _rebuild_bulk_summary_snapshot(
        *,
        summary: dict[str, Any],
        unique_codes: list[str],
        outcomes: dict[str, dict[str, str]],
    ) -> dict[str, Any]:
        processed_models = [code for code in unique_codes if outcomes.get(code, {}).get("status") == "processed"]
        skipped_models = [code for code in unique_codes if outcomes.get(code, {}).get("status") == "skipped"]
        failed_models = [code for code in unique_codes if outcomes.get(code, {}).get("status") == "failed"]
        failed_details = [
            PredictionGenerationService._build_failed_detail(code, outcomes.get(code, {}).get("reason") or "未知错误")
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
        summary["task_completed_count"] = len(outcomes)
        summary["task_processed_count"] = len(processed_models)
        summary["task_skipped_count"] = len(skipped_models)
        summary["task_failed_count"] = len(failed_models)
        return dict(summary)

    @staticmethod
    def _rebuild_bulk_history_summary_snapshot(
        *,
        summary: dict[str, Any],
        unique_codes: list[str],
        target_periods: list[str],
        task_outcomes: dict[str, dict[str, str]],
        model_failed_reason: dict[str, str],
    ) -> dict[str, Any]:
        processed_tasks = 0
        skipped_tasks = 0
        failed_tasks = 0
        for outcome in task_outcomes.values():
            status = outcome.get("status")
            if status == "processed":
                processed_tasks += 1
            elif status == "skipped":
                skipped_tasks += 1
            else:
                failed_tasks += 1
        summary["task_completed_count"] = len(task_outcomes)
        summary["task_processed_count"] = processed_tasks
        summary["task_skipped_count"] = skipped_tasks
        summary["task_failed_count"] = failed_tasks

        processed_models: list[str] = []
        skipped_models: list[str] = []
        failed_models: list[str] = []
        for model_code in unique_codes:
            statuses = [
                (task_outcomes.get(f"{model_code}:{period}") or {}).get("status")
                for period in target_periods
            ]
            if not all(status is not None for status in statuses):
                continue
            if any(status == "failed" for status in statuses):
                failed_models.append(model_code)
            elif all(status == "skipped" for status in statuses):
                skipped_models.append(model_code)
            else:
                processed_models.append(model_code)

        summary["processed_models"] = processed_models
        summary["skipped_models"] = skipped_models
        summary["failed_models"] = failed_models
        summary["processed_count"] = len(processed_models)
        summary["skipped_count"] = len(skipped_models)
        summary["failed_count"] = len(failed_models)
        summary["completed_count"] = len(processed_models) + len(skipped_models) + len(failed_models)
        summary["failed_details"] = [
            PredictionGenerationService._build_failed_detail(model_code, model_failed_reason.get(model_code, "模型未生成结果"))
            for model_code in failed_models
        ]
        return dict(summary)

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
        return PredictionGenerationService._normalize_parallelism(
            parallelism,
            task_count=selected_count,
            default_parallelism=DEFAULT_BULK_PARALLELISM,
        )

    @staticmethod
    def _normalize_single_model_parallelism(parallelism: int | None, *, period_count: int) -> int:
        return PredictionGenerationService._normalize_parallelism(
            parallelism,
            task_count=period_count,
            default_parallelism=DEFAULT_SINGLE_MODEL_PARALLELISM,
        )

    @staticmethod
    def _normalize_parallelism(parallelism: int | None, *, task_count: int, default_parallelism: int) -> int:
        if task_count <= 0:
            return 1
        if parallelism is None:
            requested = default_parallelism
        else:
            requested = int(parallelism)
            if requested < 1:
                raise ValueError("并发数必须大于 0")
        normalized = min(requested, MAX_GENERATION_PARALLELISM)
        return max(1, min(normalized, task_count))

    @staticmethod
    def _resolve_history_period_range(
        history_data: dict[str, Any],
        *,
        start_period: str = "",
        end_period: str = "",
        recent_period_count: int | None = None,
    ) -> tuple[str, str]:
        if recent_period_count is None:
            if not start_period or not end_period:
                raise ValueError("历史重算必须提供开始期号和结束期号，或选择最近期数")
            start_value = int(start_period)
            end_value = int(end_period)
            if start_value > end_value:
                raise ValueError("开始期号不能大于结束期号")
            return str(start_value), str(end_value)

        if recent_period_count not in SUPPORTED_RECENT_PERIOD_COUNTS:
            raise ValueError("最近期数仅支持 1、5、10、20")

        available_periods = sorted(
            {
                int(str(draw.get("period") or "").strip())
                for draw in history_data.get("data", [])
                if str(draw.get("period") or "").strip().isdigit()
            },
            reverse=True,
        )
        if not available_periods:
            raise ValueError("暂无可用开奖历史，不能执行历史重算")

        selected_periods = available_periods[:recent_period_count]
        return str(min(selected_periods)), str(max(selected_periods))

    @staticmethod
    def _normalize_prompt_history_period_count(prompt_history_period_count: int | None) -> int:
        if prompt_history_period_count is None:
            return DEFAULT_PROMPT_HISTORY_PERIOD_COUNT
        normalized = int(prompt_history_period_count)
        if normalized not in SUPPORTED_PROMPT_HISTORY_PERIOD_COUNTS:
            raise ValueError("Prompt历史期数仅支持 30、50、100")
        return normalized

    def _prepare_model(self, model_def: ModelDefinition) -> Any:
        self._raise_if_provider_in_cooldown(model_def.provider)
        model = ModelFactory().create(model_def)
        ok, message = model.health_check()
        if not ok:
            if self._is_transient_provider_error(message):
                self._record_provider_failure(model_def.provider)
            raise ValueError(f"模型健康检查失败: {message}")
        self._record_provider_success(model_def.provider)
        return model

    def validate_model(self, model_code: str, lottery_code: str = "dlt") -> dict[str, Any]:
        model = self.model_repository.get_model(model_code)
        if not model:
            raise KeyError(model_code)
        if bool(model.get("is_deleted")):
            raise ValueError("已删除模型不能生成预测数据")
        if not bool(model.get("is_active")):
            raise ValueError("已停用模型不能生成预测数据")
        normalized_code = normalize_lottery_code(lottery_code)
        if normalized_code not in (model.get("lottery_codes") or ["dlt"]):
            raise ValueError("该模型未配置当前彩种")
        return model

    def _get_model_definition(self, model_code: str, lottery_code: str = "dlt") -> ModelDefinition:
        self.validate_model(model_code, lottery_code=lottery_code)
        registry = self._load_model_registry_cached()
        try:
            model_def = registry.get(model_code)
            if not model_def.supports_lottery(lottery_code):
                raise ValueError("该模型未配置当前彩种")
            return model_def
        except KeyError as exc:
            raise KeyError(model_code) from exc

    def _load_model_registry_cached(self) -> Any:
        now = monotonic()
        with self._model_registry_lock:
            cached = self._model_registry_cache
            if cached and cached[0] > now:
                return cached[1]
        registry = load_model_registry()
        with self._model_registry_lock:
            self._model_registry_cache = (now + MODEL_REGISTRY_CACHE_TTL_SECONDS, registry)
        return registry

    @staticmethod
    def _load_prompt_template(lottery_code: str = "dlt", prediction_play_mode: str = "direct") -> str:
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_play_mode = PredictionGenerationService._normalize_prediction_play_mode(
            prediction_play_mode,
            lottery_code=normalized_code,
        )
        path = DEFAULT_PROMPT_PATH
        if normalized_code == "dlt":
            if normalized_play_mode == "dantuo":
                path = DLT_DANTUO_PROMPT_PATH
            elif normalized_play_mode == "compound":
                path = DLT_COMPOUND_PROMPT_PATH
            else:
                path = DEFAULT_PROMPT_PATH
        elif normalized_code == "pl3":
            path = PL3_DANTUO_PROMPT_PATH if normalized_play_mode == "dantuo" else PL3_SUM_PROMPT_PATH if normalized_play_mode == "direct_sum" else PL3_PROMPT_PATH
        elif normalized_code == "pl5":
            path = PL5_PROMPT_PATH
        elif normalized_code == "qxc":
            path = QXC_COMPOUND_PROMPT_PATH if normalized_play_mode == "compound" else QXC_PROMPT_PATH
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
        prediction_play_mode: str,
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
                    "prediction_play_mode": prediction_play_mode,
                    "target_period": target_period,
                    "model_code": model_def.model_id,
                    "model_provider": model_def.provider,
                    "history_context_count": len(history_context),
                    "prompt_length": len(prompt),
                    "max_attempts": MAX_INVALID_PREDICTION_RETRIES + 1,
                }
            },
        )
        attempts = MAX_INVALID_PREDICTION_RETRIES + 1
        for attempt in range(1, attempts + 1):
            try:
                self._raise_if_provider_in_cooldown(model_def.provider)
                raw_prediction = model.predict(prompt)
            except Exception:
                provider_error = self._extract_provider_error_from_exception()
                if self._is_transient_provider_error(provider_error):
                    self._record_provider_failure(model_def.provider)
                else:
                    self._record_provider_success(model_def.provider)
                self.logger.exception(
                    "Model prediction request failed",
                    extra={
                        "context": {
                            "lottery_code": lottery_code,
                            "prediction_play_mode": prediction_play_mode,
                            "target_period": target_period,
                            "model_code": model_def.model_id,
                            "model_provider": model_def.provider,
                            "attempt": attempt,
                            "max_attempts": attempts,
                        }
                    },
                )
                raise
            self._record_provider_success(model_def.provider)
            raw_summary = self._build_prediction_payload_summary(raw_prediction)
            raw_preview = self._build_payload_preview(raw_prediction)
            self.logger.info(
                "Model returned prediction payload",
                extra={
                    "context": {
                        "lottery_code": lottery_code,
                        "target_period": target_period,
                        "model_code": model_def.model_id,
                        "attempt": attempt,
                        "max_attempts": attempts,
                        "response_group_count": raw_summary["group_count"],
                        "response_description_count": raw_summary["description_count"],
                        "response_strategy_count": raw_summary["strategy_count"],
                        "response_play_types": raw_summary["play_types"],
                        "response_preview": raw_preview,
                    }
                },
            )
            try:
                prediction = self._finalize_prediction(
                    raw_prediction,
                    model_def,
                    prediction_date,
                    target_period,
                    lottery_code=lottery_code,
                    prediction_play_mode=prediction_play_mode,
                )
            except Exception:
                self.logger.exception(
                    "Model prediction normalization failed",
                    extra={
                        "context": {
                            "lottery_code": lottery_code,
                            "prediction_play_mode": prediction_play_mode,
                            "target_period": target_period,
                            "model_code": model_def.model_id,
                            "attempt": attempt,
                            "max_attempts": attempts,
                            "response_preview": raw_preview,
                        }
                    },
                )
                raise
            if self._validate_prediction(
                prediction,
                lottery_code=lottery_code,
                prediction_play_mode=prediction_play_mode,
            ):
                normalized_summary = self._build_prediction_payload_summary(prediction)
                self.logger.info(
                    "Prediction generation completed",
                    extra={
                        "context": {
                            "lottery_code": lottery_code,
                            "prediction_play_mode": prediction_play_mode,
                            "target_period": target_period,
                            "model_code": model_def.model_id,
                            "attempt": attempt,
                            "max_attempts": attempts,
                            "normalized_group_count": normalized_summary["group_count"],
                            "normalized_description_count": normalized_summary["description_count"],
                            "normalized_strategy_count": normalized_summary["strategy_count"],
                            "normalized_play_types": normalized_summary["play_types"],
                        }
                    },
                )
                return prediction
            normalized_summary = self._build_prediction_payload_summary(prediction)
            normalized_preview = self._build_payload_preview(prediction)
            self.logger.warning(
                "Model prediction validation failed",
                extra={
                    "context": {
                        "lottery_code": lottery_code,
                        "prediction_play_mode": prediction_play_mode,
                        "target_period": target_period,
                        "model_code": model_def.model_id,
                        "attempt": attempt,
                        "max_attempts": attempts,
                        "response_group_count": normalized_summary["group_count"],
                        "response_play_types": normalized_summary["play_types"],
                        "response_preview": normalized_preview,
                    }
                },
            )
        raise ValueError(f"模型返回的预测结构无效: {model_def.model_id}")

    @staticmethod
    def _extract_provider_error_from_exception() -> str:
        import traceback

        return traceback.format_exc()

    @staticmethod
    def _is_transient_provider_error(message: Any) -> bool:
        text = str(message or "").lower()
        if not text:
            return False
        transient_markers = (
            "502",
            "503",
            "504",
            "bad gateway",
            "gateway timeout",
            "service unavailable",
            "internalservererror",
            "temporarily unavailable",
        )
        return any(marker in text for marker in transient_markers)

    def _raise_if_provider_in_cooldown(self, provider_code: str) -> None:
        provider = str(provider_code or "").strip().lower()
        if not provider:
            return
        with self._provider_failure_lock:
            state = self._provider_failure_state.get(provider)
            if not state:
                return
            _, cooldown_until = state
        if monotonic() < cooldown_until:
            raise ValueError(f"供应商[{provider}]处于熔断冷却中，请稍后重试")

    def _record_provider_failure(self, provider_code: str) -> None:
        provider = str(provider_code or "").strip().lower()
        if not provider:
            return
        now = monotonic()
        with self._provider_failure_lock:
            failures, cooldown_until = self._provider_failure_state.get(provider, (0, 0.0))
            if cooldown_until > 0 and now >= cooldown_until:
                failures = 0
            failures += 1
            if failures >= 2:
                cooldown_until = now + PROVIDER_FAILURE_COOLDOWN_SECONDS
                self.logger.warning(
                    "Provider failure circuit opened",
                    extra={
                        "context": {
                            "provider_code": provider,
                            "cooldown_seconds": PROVIDER_FAILURE_COOLDOWN_SECONDS,
                            "failure_count": failures,
                        }
                    },
                )
            self._provider_failure_state[provider] = (failures, cooldown_until)

    def _record_provider_success(self, provider_code: str) -> None:
        provider = str(provider_code or "").strip().lower()
        if not provider:
            return
        with self._provider_failure_lock:
            if provider in self._provider_failure_state:
                self._provider_failure_state.pop(provider, None)

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
        prediction_play_mode: str = "direct",
    ) -> dict[str, Any]:
        normalized_lottery_code = normalize_lottery_code(lottery_code)
        normalized_prediction_play_mode = self._normalize_prediction_play_mode(
            prediction_play_mode,
            lottery_code=normalized_lottery_code,
        )
        normalized = self.prediction_service.normalize_prediction(prediction, lottery_code=lottery_code)
        normalized["prediction_date"] = prediction_date
        normalized["target_period"] = target_period
        normalized["lottery_code"] = normalized_lottery_code
        normalized["model_id"] = model_def.model_id
        normalized["model_name"] = model_def.name
        normalized["model_provider"] = model_def.provider
        normalized["model_version"] = model_def.version
        normalized["model_tags"] = model_def.tags
        normalized["model_api_model"] = model_def.api_model
        normalized["prediction_play_mode"] = normalized_prediction_play_mode
        return normalized

    def _validate_prediction(
        self,
        prediction: dict[str, Any],
        lottery_code: str = "dlt",
        prediction_play_mode: str = "direct",
    ) -> bool:
        groups = prediction.get("predictions", [])
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_play_mode = self._normalize_prediction_play_mode(prediction_play_mode, lottery_code=normalized_code)
        if normalized_code == "dlt":
            expected_group_count = 1 if normalized_play_mode == "dantuo" else 4 if normalized_play_mode == "compound" else 5
        elif normalized_code == "pl3" and normalized_play_mode in {"direct_sum", "dantuo"}:
            expected_group_count = 3
        else:
            expected_group_count = 5
        if len(groups) != expected_group_count:
            return False
        for group in groups:
            if normalized_code == "pl3":
                play_type = str(group.get("play_type") or "").strip().lower()
                digits = normalize_digit_balls(group.get("digits", []))
                if normalized_play_mode == "direct_sum":
                    if play_type != "direct_sum":
                        return False
                    if len(digits) != 0:
                        return False
                    sum_value = str(group.get("sum_value") or "").strip()
                    if not sum_value.isdigit():
                        return False
                    if int(sum_value) < 0 or int(sum_value) > 27:
                        return False
                elif normalized_play_mode == "dantuo":
                    if play_type != "pl3_dantuo":
                        return False
                    for position, dan_key, tuo_key in (
                        ("百位", "direct_hundreds_dan", "direct_hundreds_tuo"),
                        ("十位", "direct_tens_dan", "direct_tens_tuo"),
                        ("个位", "direct_units_dan", "direct_units_tuo"),
                    ):
                        dan_values = PredictionService._normalize_pl3_dantuo_position(group.get(dan_key))
                        tuo_values = PredictionService._normalize_pl3_dantuo_position(group.get(tuo_key))
                        if dan_values is None or tuo_values is None:
                            return False
                        if len(dan_values) > 1 or len(tuo_values) < 1:
                            return False
                        if set(dan_values) & set(tuo_values):
                            return False
                else:
                    if play_type != "direct":
                        return False
                    if len(digits) != 3:
                        return False
                continue
            if normalized_code == "pl5":
                play_type = str(group.get("play_type") or "").strip().lower()
                digits = normalize_digit_balls(group.get("digits", []))
                if play_type != "direct":
                    return False
                if len(digits) != 5:
                    return False
                continue
            if normalized_code == "qxc":
                play_type = str(group.get("play_type") or "").strip().lower()
                position_selections = PredictionService._normalize_qxc_position_selections(group.get("position_selections"))
                if normalized_play_mode == "compound":
                    if play_type != "qxc_compound":
                        return False
                    if len(position_selections) != 7:
                        return False
                    if any(not values for values in position_selections):
                        return False
                else:
                    digits = normalize_digit_balls(group.get("digits", []))
                    if play_type != "direct":
                        return False
                    if len(digits) != 7:
                        return False
                continue
            if normalized_play_mode == "dantuo":
                play_type = str(group.get("play_type") or "").strip().lower()
                if play_type != "dlt_dantuo":
                    return False
                front_dan = self._normalize_dlt_zone_numbers(group.get("front_dan"), zone="front")
                front_tuo = self._normalize_dlt_zone_numbers(group.get("front_tuo"), zone="front")
                back_dan = self._normalize_dlt_zone_numbers(group.get("back_dan"), zone="back")
                back_tuo = self._normalize_dlt_zone_numbers(group.get("back_tuo"), zone="back")
                if front_dan is None or front_tuo is None or back_dan is None or back_tuo is None:
                    return False
                if not (1 <= len(front_dan) <= 4):
                    return False
                if len(front_tuo) < 2:
                    return False
                if len(front_dan) + len(front_tuo) < 6:
                    return False
                if len(back_dan) > 1:
                    return False
                if len(back_tuo) < 2:
                    return False
                if len(back_dan) + len(back_tuo) < 3:
                    return False
                if set(front_dan) & set(front_tuo):
                    return False
                if set(back_dan) & set(back_tuo):
                    return False
                continue
            if normalized_play_mode == "compound":
                play_type = str(group.get("play_type") or "").strip().lower()
                red_balls = [str(item).zfill(2) for item in group.get("red_balls", [])]
                blue_balls = self._normalize_blue_balls(group.get("blue_balls", group.get("blue_ball")))
                strategy = str(group.get("strategy") or "").strip()
                expected_shapes = {
                    1: (6, 2),
                    2: (7, 2),
                    3: (6, 3),
                    4: (7, 3),
                }
                group_id = int(group.get("group_id") or 0)
                expected_shape = expected_shapes.get(group_id)
                if play_type != "dlt_compound" or expected_shape is None:
                    return False
                expected_red_count, expected_blue_count = expected_shape
                if strategy != "增强型综合决策者":
                    return False
                if len(red_balls) != expected_red_count or red_balls != sorted(red_balls):
                    return False
                if any((not number.isdigit()) or int(number) not in range(1, 36) for number in red_balls):
                    return False
                if len(set(red_balls)) != len(red_balls):
                    return False
                if len(blue_balls) != expected_blue_count or blue_balls != sorted(blue_balls):
                    return False
                if any((not number.isdigit()) or int(number) not in range(1, 13) for number in blue_balls):
                    return False
                if len(set(blue_balls)) != len(blue_balls):
                    return False
                continue
            red_balls = [str(item).zfill(2) for item in group.get("red_balls", [])]
            blue_balls = self._normalize_blue_balls(group.get("blue_balls", group.get("blue_ball")))
            if len(red_balls) != 5 or red_balls != sorted(red_balls):
                return False
            if any((not number.isdigit()) or int(number) not in range(1, 36) for number in red_balls):
                return False
            if len(blue_balls) != 2 or blue_balls != sorted(blue_balls):
                return False
            if any((not number.isdigit()) or int(number) not in range(1, 13) for number in blue_balls):
                return False
        return True

    @staticmethod
    def _normalize_prediction_play_mode(prediction_play_mode: str, lottery_code: str = "dlt") -> str:
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_mode = str(prediction_play_mode or "direct").strip().lower() or "direct"
        if normalized_code == "dlt":
            if normalized_mode not in {"direct", "compound", "dantuo"}:
                raise ValueError("大乐透预测模式仅支持 direct / compound / dantuo")
            return normalized_mode
        if normalized_code == "pl5":
            if normalized_mode != "direct":
                raise ValueError("排列5预测模式仅支持 direct")
            return "direct"
        if normalized_code == "qxc":
            if normalized_mode not in {"direct", "compound"}:
                raise ValueError("七星彩预测模式仅支持 direct / compound")
            return normalized_mode
        if normalized_mode not in {"direct", "direct_sum", "dantuo"}:
            raise ValueError("排列3预测模式仅支持 direct / direct_sum / dantuo")
        return normalized_mode

    @classmethod
    def _prediction_matches_play_mode(
        cls,
        prediction_model_payload: dict[str, Any],
        *,
        lottery_code: str,
        prediction_play_mode: str,
    ) -> bool:
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_play_mode = cls._normalize_prediction_play_mode(prediction_play_mode, lottery_code=normalized_code)
        if normalized_code == "dlt":
            groups = prediction_model_payload.get("predictions")
            if not isinstance(groups, list) or not groups:
                return normalized_play_mode == "direct"
            has_compound = any(
                str(group.get("play_type") or "").strip().lower() == "dlt_compound"
                for group in groups
                if isinstance(group, dict)
            )
            has_dantuo = any(
                str(group.get("play_type") or "").strip().lower() == "dlt_dantuo"
                for group in groups
                if isinstance(group, dict)
            )
            if normalized_play_mode == "dantuo":
                return has_dantuo
            if normalized_play_mode == "compound":
                return has_compound
            return not has_dantuo and not has_compound
        if normalized_code == "qxc":
            groups = prediction_model_payload.get("predictions")
            if not isinstance(groups, list) or not groups:
                return normalized_play_mode == "direct"
            has_compound = any(
                str(group.get("play_type") or "").strip().lower() == "qxc_compound"
                for group in groups
                if isinstance(group, dict)
            )
            return has_compound if normalized_play_mode == "compound" else not has_compound
        if normalized_code != "pl3":
            return True
        groups = prediction_model_payload.get("predictions")
        if not isinstance(groups, list) or not groups:
            return normalized_play_mode == "direct"
        play_types = {
            str(group.get("play_type") or "").strip().lower()
            for group in groups
            if isinstance(group, dict)
        }
        if normalized_play_mode == "direct_sum":
            return "direct_sum" in play_types
        if normalized_play_mode == "dantuo":
            return "pl3_dantuo" in play_types
        return "direct" in play_types

    @classmethod
    def _build_model_mode_key(
        cls,
        *,
        model_id: str,
        prediction_play_mode: str | None,
        lottery_code: str,
    ) -> str:
        normalized_model_id = str(model_id or "").strip()
        if not normalized_model_id:
            return ""
        normalized_lottery_code = normalize_lottery_code(lottery_code)
        normalized_play_mode = cls._normalize_prediction_play_mode(
            prediction_play_mode or "direct",
            lottery_code=normalized_lottery_code,
        )
        return f"{normalized_model_id}::{normalized_play_mode}"

    @classmethod
    def _extract_model_play_mode(
        cls,
        model_payload: dict[str, Any],
        *,
        lottery_code: str,
    ) -> str:
        normalized_lottery_code = normalize_lottery_code(lottery_code)
        explicit_mode = str(model_payload.get("prediction_play_mode") or "").strip().lower()
        if explicit_mode:
            return cls._normalize_prediction_play_mode(explicit_mode, lottery_code=normalized_lottery_code)
        groups = model_payload.get("predictions")
        if isinstance(groups, list):
            if normalized_lottery_code == "dlt":
                has_compound = any(
                    str(group.get("play_type") or "").strip().lower() == "dlt_compound"
                    for group in groups
                    if isinstance(group, dict)
                )
                has_dantuo = any(
                    str(group.get("play_type") or "").strip().lower() == "dlt_dantuo"
                    for group in groups
                    if isinstance(group, dict)
                )
                if has_compound:
                    return "compound"
                return "dantuo" if has_dantuo else "direct"
            if normalized_lottery_code == "qxc":
                has_compound = any(
                    str(group.get("play_type") or "").strip().lower() == "qxc_compound"
                    for group in groups
                    if isinstance(group, dict)
                )
                return "compound" if has_compound else "direct"
            has_direct_sum = any(
                str(group.get("play_type") or "").strip().lower() == "direct_sum"
                for group in groups
                if isinstance(group, dict)
            )
            has_dantuo = any(
                str(group.get("play_type") or "").strip().lower() == "pl3_dantuo"
                for group in groups
                if isinstance(group, dict)
            )
            if has_dantuo:
                return "dantuo"
            if has_direct_sum:
                return "direct_sum"
        return "direct"

    @staticmethod
    def _normalize_dlt_zone_numbers(value: Any, *, zone: str) -> list[str] | None:
        if not isinstance(value, list):
            return None
        valid_range = range(1, 36) if zone == "front" else range(1, 13)
        normalized = sorted({str(item).zfill(2) for item in value})
        if any((not number.isdigit()) or int(number) not in valid_range for number in normalized):
            return None
        return normalized

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
