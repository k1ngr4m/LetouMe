from __future__ import annotations

from datetime import date, datetime
from itertools import combinations
import math
from statistics import pstdev
from time import perf_counter
from typing import Any

from backend.app.cache import runtime_cache
from backend.app.dlt_rules import (
    DLT_OLD_FIXED_PRIZE_RULES,
    dlt_prize_level_order,
    resolve_dlt_fallback_prize_amount,
    resolve_dlt_prize_level,
)
from backend.app.logging_utils import get_logger
from backend.app.lotteries import normalize_digit_balls, normalize_group_digits, normalize_lottery_code
from backend.app.repositories.model_repository import ModelRepository
from backend.app.repositories.prediction_repository import PredictionRepository
from backend.app.services.lottery_service import LotteryService


class PredictionService:
    BET_COST = 2
    DEFAULT_STRATEGY_LABEL = "AI 组合策略"
    RECENT_SCORE_WINDOW = 20
    FIXED_PRIZE_RULES = dict(DLT_OLD_FIXED_PRIZE_RULES)
    PL3_FIXED_PRIZE_RULES = {
        "直选": 1040,
        "和值": 1040,
        "组选3": 346,
        "组选6": 173,
    }
    PL3_DIRECT_SUM_COST_RULES = {
        0: 2,
        1: 6,
        2: 12,
        3: 20,
        4: 30,
        5: 42,
        6: 56,
        7: 72,
        8: 90,
        9: 110,
        10: 126,
        11: 138,
        12: 146,
        13: 150,
        14: 150,
        15: 146,
        16: 138,
        17: 126,
        18: 110,
        19: 90,
        20: 72,
        21: 56,
        22: 42,
        23: 30,
        24: 20,
        25: 12,
        26: 6,
        27: 2,
    }
    PL5_FIXED_PRIZE_RULES = {
        "直选": 100000,
    }

    def __init__(
        self,
        prediction_repository: PredictionRepository | None = None,
        lottery_service: LotteryService | None = None,
        model_repository: ModelRepository | None = None,
    ) -> None:
        self.prediction_repository = prediction_repository or PredictionRepository()
        self.lottery_service = lottery_service or LotteryService()
        self.model_repository = model_repository or ModelRepository()
        self.logger = get_logger("services.prediction")

    @staticmethod
    def normalize_blue_balls(value: Any) -> list[str]:
        if isinstance(value, list):
            return sorted(str(item).zfill(2) for item in value)
        if isinstance(value, str) and value:
            return [str(value).zfill(2)]
        return []

    @staticmethod
    def serialize_prediction_date(value: Any) -> str:
        if isinstance(value, datetime):
            return value.date().isoformat()
        if isinstance(value, date):
            return value.isoformat()
        return str(value or "")

    def normalize_prediction(self, prediction: dict[str, Any], lottery_code: str = "dlt") -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code or prediction.get("lottery_code"))
        normalized_predictions = []
        for group in prediction.get("predictions", []):
            play_type = str(group.get("play_type") or "").strip().lower()
            blue_balls = self.normalize_blue_balls(group.get("blue_balls", group.get("blue_ball")))
            front_dan = self._normalize_dlt_zone_numbers(group.get("front_dan"), zone="front") or []
            front_tuo = self._normalize_dlt_zone_numbers(group.get("front_tuo"), zone="front") or []
            back_dan = self._normalize_dlt_zone_numbers(group.get("back_dan"), zone="back") or []
            back_tuo = self._normalize_dlt_zone_numbers(group.get("back_tuo"), zone="back") or []
            red_balls = sorted(str(item).zfill(2) for item in group.get("red_balls", []))
            if normalized_code == "dlt" and play_type == "dlt_dantuo":
                red_balls = sorted({*front_dan, *front_tuo})
                blue_balls = sorted({*back_dan, *back_tuo})
            normalized_predictions.append(
                {
                    **group,
                    "play_type": play_type or group.get("play_type"),
                    "red_balls": red_balls,
                    "blue_balls": blue_balls,
                    "blue_ball": blue_balls[0] if blue_balls else None,
                    "digits": normalize_digit_balls(group.get("digits", [])),
                    "front_dan": front_dan,
                    "front_tuo": front_tuo,
                    "back_dan": back_dan,
                    "back_tuo": back_tuo,
                }
            )

        return {
            **prediction,
            "lottery_code": normalized_code,
            "predictions": normalized_predictions,
        }

    def get_current_payload(self, lottery_code: str = "dlt", include_inactive_models: bool = True) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        cache_scope = "all-models" if include_inactive_models else "active-models"
        payload = runtime_cache.get_or_set(
            f"predictions:{normalized_code}:current:scored:{cache_scope}",
            ttl_seconds=60,
            loader=lambda: self._build_current_payload(lottery_code=normalized_code, include_inactive_models=include_inactive_models),
        )
        self.logger.debug("Loaded current prediction payload", extra={"context": {"target_period": payload.get("target_period"), "model_count": len(payload.get("models", []))}})
        return payload

    def get_current_payload_by_period(
        self,
        target_period: str,
        lottery_code: str = "dlt",
        include_inactive_models: bool = True,
    ) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        cache_scope = "all-models" if include_inactive_models else "active-models"
        return runtime_cache.get_or_set(
            f"predictions:{normalized_code}:current:{target_period}:scored:{cache_scope}",
            ttl_seconds=60,
            loader=lambda: self._build_current_payload(
                target_period=target_period,
                lottery_code=normalized_code,
                include_inactive_models=include_inactive_models,
            ),
        )

    def _build_current_payload(
        self,
        lottery_code: str = "dlt",
        target_period: str | None = None,
        include_inactive_models: bool = True,
    ) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        payload = (
            self.prediction_repository.get_current_prediction_by_period(target_period, lottery_code=normalized_code)
            if target_period
            else self.prediction_repository.get_current_prediction(lottery_code=normalized_code)
        ) or {
            "lottery_code": normalized_code,
            "prediction_date": "",
            "target_period": target_period or "",
            "models": [],
        }
        active_model_codes = self._get_active_model_codes() if not include_inactive_models else None
        models = (
            self._filter_models_by_active_status(payload.get("models", []), active_model_codes or set())
            if active_model_codes is not None
            else list(payload.get("models", []))
        )
        score_profiles = self._get_current_model_score_profiles(lottery_code=normalized_code)
        return {
            **payload,
            "lottery_code": normalized_code,
            "prediction_date": self.serialize_prediction_date(payload.get("prediction_date")),
            "models": [
                {
                    **model,
                    "prediction_play_mode": self._infer_prediction_play_mode(model),
                    "score_profile": self._get_model_score_profile(score_profiles, model),
                }
                for model in models
            ],
        }

    def get_history_payload(self, limit: int | None = None, offset: int = 0, lottery_code: str = "dlt") -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        return runtime_cache.get_or_set(
            f"predictions:{normalized_code}:history:full:{limit or 'all'}:{offset}",
            ttl_seconds=60,
            loader=lambda: {
                "lottery_code": normalized_code,
                "predictions_history": self.prediction_repository.list_history_records(limit=limit, offset=offset, lottery_code=normalized_code),
                "total_count": self.prediction_repository.count_history_records(lottery_code=normalized_code),
            },
        )

    def get_history_list_payload(
        self,
        limit: int | None = None,
        offset: int = 0,
        lottery_code: str = "dlt",
        strategy_filters: list[str] | None = None,
        play_type_filters: list[str] | None = None,
        strategy_match_mode: str = "all",
        include_inactive_models: bool = True,
    ) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_strategy_filters = self._normalize_strategy_filters(strategy_filters)
        if normalized_code == "pl3":
            normalized_strategy_filters = []
        normalized_play_type_filters = self._normalize_play_type_filters(play_type_filters)
        normalized_strategy_match_mode = str(strategy_match_mode or "all").strip().lower() or "all"
        if normalized_strategy_match_mode != "all":
            raise ValueError("不支持的方案筛选模式")
        strategy_cache_key = ",".join(normalized_strategy_filters) if normalized_strategy_filters else "-"
        play_type_cache_key = ",".join(normalized_play_type_filters) if normalized_play_type_filters else "-"
        cache_scope = "all-models" if include_inactive_models else "active-models"
        payload = runtime_cache.get_or_set(
            f"predictions:{normalized_code}:history:list:v2:{limit or 'all'}:{offset}:strategy:{strategy_cache_key}:play_type:{play_type_cache_key}:{normalized_strategy_match_mode}:{cache_scope}",
            ttl_seconds=60,
            loader=lambda: self._build_history_list_payload(
                limit=limit,
                offset=offset,
                lottery_code=normalized_code,
                strategy_filters=normalized_strategy_filters,
                play_type_filters=normalized_play_type_filters,
                strategy_match_mode=normalized_strategy_match_mode,
                include_inactive_models=include_inactive_models,
            ),
        )
        self.logger.info(
            "Loaded prediction history summaries",
            extra={
                "context": {
                    "limit": limit,
                    "offset": offset,
                    "strategy_filter_count": len(normalized_strategy_filters),
                    "play_type_filter_count": len(normalized_play_type_filters),
                    "strategy_match_mode": normalized_strategy_match_mode,
                    "returned_count": len(payload["predictions_history"]),
                }
            },
        )
        return payload

    def get_history_detail_payload(
        self,
        target_period: str,
        lottery_code: str = "dlt",
        include_inactive_models: bool = True,
    ) -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        cache_scope = "all-models" if include_inactive_models else "active-models"
        raw_payload = runtime_cache.get_or_set(
            f"predictions:{normalized_code}:history:detail:{target_period}:{cache_scope}",
            ttl_seconds=60,
            loader=lambda: self.prediction_repository.get_history_record_detail(target_period, lottery_code=normalized_code),
        )
        payload = self._annotate_history_record(raw_payload) if raw_payload else None
        active_model_codes = self._get_active_model_codes() if (payload and not include_inactive_models) else None
        if payload and active_model_codes is not None:
            models = self._filter_models_by_active_status(payload.get("models", []), active_model_codes)
            if not models:
                payload = None
            else:
                payload = {
                    **payload,
                    "models": models,
                    "period_summary": {
                        "total_bet_count": sum(int(model.get("bet_count") or 0) for model in models),
                        "total_cost_amount": sum(int(model.get("cost_amount") or 0) for model in models),
                        "total_prize_amount": sum(int(model.get("prize_amount") or 0) for model in models),
                    },
                }
        if payload:
            score_profiles = self._build_score_profiles([payload])
            payload = {
                **payload,
                "models": [
                    {
                        **model,
                        "prediction_play_mode": self._infer_prediction_play_mode(model),
                        "score_profile": self._get_model_score_profile(score_profiles, model),
                    }
                    for model in payload.get("models", [])
                ],
            }
        self.logger.info(
            "Loaded prediction history detail",
            extra={"context": {"target_period": target_period, "found": bool(payload)}},
        )
        return payload

    def get_current_detail_payload(self, target_period: str, lottery_code: str = "dlt") -> dict[str, Any] | None:
        payload = self.get_current_payload_by_period(target_period, lottery_code=lottery_code)
        if not payload.get("target_period") or payload.get("target_period") != target_period:
            return None
        return payload

    def get_settings_record_list_payload(self, lottery_code: str = "dlt") -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        current_payload = self.get_current_payload(normalized_code)
        history_payload = self.get_history_list_payload(lottery_code=normalized_code)
        records: list[dict[str, Any]] = []

        if current_payload.get("target_period"):
            records.append(
                {
                    "record_type": "current",
                    "lottery_code": normalized_code,
                    "target_period": current_payload.get("target_period", ""),
                    "prediction_date": self.serialize_prediction_date(current_payload.get("prediction_date")),
                    "actual_result": None,
                    "model_count": len(current_payload.get("models", [])),
                    "status_label": "待开奖",
                }
            )

        for record in history_payload.get("predictions_history", []):
            records.append(
                {
                    "record_type": "history",
                    "lottery_code": normalized_code,
                    "target_period": record.get("target_period", ""),
                    "prediction_date": self.serialize_prediction_date(record.get("prediction_date")),
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

    def get_settings_record_detail_payload(self, record_type: str, target_period: str, lottery_code: str = "dlt") -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_type = str(record_type or "").strip().lower()
        if normalized_type == "current":
            payload = self.get_current_detail_payload(target_period, lottery_code=normalized_code)
        elif normalized_type == "history":
            payload = self.get_history_detail_payload(target_period, lottery_code=normalized_code)
        else:
            raise ValueError("不支持的预测记录类型")

        if not payload:
            return None
        score_profiles = self._build_score_profiles([payload]) if normalized_type == "history" else {}
        return {
            "record_type": normalized_type,
            "lottery_code": normalized_code,
            "prediction_date": self.serialize_prediction_date(payload.get("prediction_date")),
            "target_period": payload.get("target_period", ""),
            "actual_result": payload.get("actual_result"),
            "models": payload.get("models", []),
            "model_stats": self._build_model_stats([payload], score_profiles) if normalized_type == "history" else [],
        }

    def save_current_prediction(self, payload: dict[str, Any]) -> dict[str, Any]:
        lottery_code = normalize_lottery_code(payload.get("lottery_code"))
        target_period = str(payload.get("target_period") or "")
        current = self.get_current_payload_by_period(target_period, lottery_code=lottery_code) if target_period else self.get_current_payload(lottery_code=lottery_code)
        if current.get("target_period") == target_period:
            existing_model_map = {
                self._build_model_identity_key(model): model
                for model in current.get("models", [])
                if self._build_model_identity_key(model)
            }
            for model in payload.get("models", []):
                model_key = self._build_model_identity_key(model)
                if not model_key:
                    continue
                existing_model_map[model_key] = model

            payload = {
                **current,
                "lottery_code": lottery_code,
                "prediction_date": payload.get("prediction_date", current.get("prediction_date")),
                "target_period": target_period or current.get("target_period"),
                "models": list(existing_model_map.values()),
            }

        payload["lottery_code"] = lottery_code
        self.prediction_repository.upsert_current_prediction(payload)
        self._invalidate_prediction_cache(target_period=target_period, lottery_code=lottery_code)
        self.logger.info(
            "Saved current prediction",
            extra={"context": {"target_period": payload.get("target_period"), "model_count": len(payload.get("models", []))}},
        )
        return payload

    def archive_current_prediction_if_needed(self, lottery_data: dict[str, Any], lottery_code: str = "dlt") -> None:
        normalized_code = normalize_lottery_code(lottery_code or lottery_data.get("lottery_code"))
        old_predictions = self.prediction_repository.get_current_prediction(lottery_code=normalized_code)
        if not old_predictions:
            return

        old_target_period = str(old_predictions.get("target_period") or "")
        latest_period = str((lottery_data.get("data") or [{}])[0].get("period") or "")
        if not old_target_period or not latest_period or int(old_target_period) > int(latest_period):
            return

        if self.prediction_repository.history_record_exists(old_target_period, lottery_code=normalized_code):
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
                normalized_group = self.normalize_prediction({"predictions": [pred_group]}, lottery_code=normalized_code).get("predictions", [pred_group])[0]
                pred_with_hit = dict(normalized_group)
                pred_with_hit["hit_result"] = self.calculate_hit_result(normalized_group, actual_result, lottery_code=normalized_code)
                predictions_with_hits.append(pred_with_hit)

            if not predictions_with_hits:
                continue

            best_pred = max(predictions_with_hits, key=lambda p: p["hit_result"]["total_hits"])
            models_with_hits.append(
                {
                    "model_id": model_data.get("model_id"),
                    "prediction_play_mode": str(model_data.get("prediction_play_mode") or "direct"),
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
            "lottery_code": normalized_code,
            "target_period": old_target_period,
            "actual_result": actual_result,
            "models": models_with_hits,
        }
        self.prediction_repository.upsert_history_record(new_record)
        self._invalidate_prediction_cache(target_period=old_target_period, lottery_code=normalized_code)
        self.logger.info(
            "Archived current prediction into history",
            extra={"context": {"target_period": old_target_period, "model_count": len(models_with_hits)}},
        )

    @classmethod
    def calculate_hit_result(cls, prediction_group: dict[str, Any], actual_result: dict[str, Any], lottery_code: str = "dlt") -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code or prediction_group.get("lottery_code") or actual_result.get("lottery_code"))
        if normalized_code == "pl3":
            play_type = str(prediction_group.get("play_type") or "direct").strip().lower()
            actual_digits = normalize_digit_balls(actual_result.get("digits", actual_result.get("red_balls", [])))
            if play_type == "direct_sum":
                sum_value = prediction_group.get("sum_value")
                try:
                    predicted_sum = int(str(sum_value).strip())
                except (TypeError, ValueError):
                    predicted_sum = -1
                actual_sum = sum(int(item) for item in actual_digits if str(item).isdigit())
                is_exact_match = predicted_sum == actual_sum
                return {
                    "digit_hits": [str(actual_sum)] if is_exact_match else [],
                    "digit_hit_count": 1 if is_exact_match else 0,
                    "red_hits": [],
                    "red_hit_count": 0,
                    "blue_hits": [],
                    "blue_hit_count": 0,
                    "total_hits": 1 if is_exact_match else 0,
                    "is_exact_match": is_exact_match,
                }
            digits = normalize_digit_balls(prediction_group.get("digits", prediction_group.get("red_balls", [])))
            if play_type == "direct":
                digit_hits = [digit for digit, actual in zip(digits, actual_digits) if digit == actual]
                return {
                    "digit_hits": digit_hits,
                    "digit_hit_count": len(digit_hits),
                    "red_hits": [],
                    "red_hit_count": 0,
                    "blue_hits": [],
                    "blue_hit_count": 0,
                    "total_hits": len(digit_hits),
                    "is_exact_match": digits == actual_digits,
                }
            predicted_group = normalize_group_digits(digits)
            actual_group = normalize_group_digits(actual_digits)
            is_winning = predicted_group == actual_group
            return {
                "digit_hits": predicted_group if is_winning else [],
                "digit_hit_count": 3 if is_winning else 0,
                "red_hits": [],
                "red_hit_count": 0,
                "blue_hits": [],
                "blue_hit_count": 0,
                "total_hits": 3 if is_winning else 0,
                "is_exact_match": is_winning,
            }
        if normalized_code == "pl5":
            actual_digits = normalize_digit_balls(actual_result.get("digits", actual_result.get("red_balls", [])))
            digits = normalize_digit_balls(prediction_group.get("digits", prediction_group.get("red_balls", [])))
            digit_hits = [digit for digit, actual in zip(digits, actual_digits) if digit == actual]
            return {
                "digit_hits": digit_hits,
                "digit_hit_count": len(digit_hits),
                "red_hits": [],
                "red_hit_count": 0,
                "blue_hits": [],
                "blue_hit_count": 0,
                "total_hits": len(digit_hits),
                "is_exact_match": digits == actual_digits and len(digits) == 5,
            }

        play_type = str(prediction_group.get("play_type") or "direct").strip().lower()
        if play_type == "dlt_dantuo":
            return cls._calculate_dlt_dantuo_hit_result(prediction_group, actual_result)
        if play_type == "dlt_compound":
            return cls._calculate_dlt_compound_hit_result(prediction_group, actual_result)
        red_hits = [b for b in prediction_group["red_balls"] if b in actual_result["red_balls"]]
        blue_hits = [b for b in prediction_group["blue_balls"] if b in actual_result["blue_balls"]]
        return {
            "red_hits": red_hits,
            "red_hit_count": len(red_hits),
            "blue_hits": blue_hits,
            "blue_hit_count": len(blue_hits),
            "total_hits": len(red_hits) + len(blue_hits),
        }

    @classmethod
    def _calculate_dlt_dantuo_hit_result(cls, prediction_group: dict[str, Any], actual_result: dict[str, Any]) -> dict[str, Any]:
        front_dan = cls._normalize_dlt_zone_numbers(prediction_group.get("front_dan", []), zone="front")
        front_tuo = cls._normalize_dlt_zone_numbers(prediction_group.get("front_tuo", []), zone="front")
        back_dan = cls._normalize_dlt_zone_numbers(prediction_group.get("back_dan", []), zone="back")
        back_tuo = cls._normalize_dlt_zone_numbers(prediction_group.get("back_tuo", []), zone="back")
        actual_red = cls._normalize_dlt_zone_numbers(actual_result.get("red_balls"), zone="front")
        actual_blue = cls._normalize_dlt_zone_numbers(actual_result.get("blue_balls"), zone="back")
        if not front_dan or not front_tuo or actual_red is None or actual_blue is None:
            return {
                "red_hits": [],
                "red_hit_count": 0,
                "blue_hits": [],
                "blue_hit_count": 0,
                "total_hits": 0,
                "winning_bet_count": 0,
                "bet_count": 0,
                "prize_breakdown": [],
            }

        front_dan = front_dan or []
        front_tuo = front_tuo or []
        back_dan = back_dan or []
        back_tuo = back_tuo or []
        front_pick_count = 5 - len(front_dan)
        back_pick_count = 2 - len(back_dan)
        if front_pick_count < 0 or back_pick_count < 0:
            return {
                "red_hits": [],
                "red_hit_count": 0,
                "blue_hits": [],
                "blue_hit_count": 0,
                "total_hits": 0,
                "winning_bet_count": 0,
                "bet_count": 0,
                "prize_breakdown": [],
            }
        if len(front_tuo) < front_pick_count or len(back_tuo) < back_pick_count:
            return {
                "red_hits": [],
                "red_hit_count": 0,
                "blue_hits": [],
                "blue_hit_count": 0,
                "total_hits": 0,
                "winning_bet_count": 0,
                "bet_count": 0,
                "prize_breakdown": [],
            }

        prize_counter: dict[str, int] = {}
        best_level_rank: int | None = None
        best_level: str | None = None
        best_red_hits = 0
        best_blue_hits = 0
        best_red_combo: list[str] = []
        best_blue_combo: list[str] = []
        total_bets = 0

        for front_tuo_pick in combinations(front_tuo, front_pick_count):
            picked_red = sorted([*front_dan, *front_tuo_pick])
            red_hit_count = len(set(picked_red) & set(actual_red))
            for back_tuo_pick in combinations(back_tuo, back_pick_count):
                picked_blue = sorted([*back_dan, *back_tuo_pick])
                blue_hit_count = len(set(picked_blue) & set(actual_blue))
                total_bets += 1
                prize_level = resolve_dlt_prize_level(red_hit_count, blue_hit_count, actual_result.get("period"))
                if not prize_level:
                    continue
                prize_counter[prize_level] = prize_counter.get(prize_level, 0) + 1
                current_rank = dlt_prize_level_order(actual_result.get("period")).index(prize_level)
                if best_level_rank is None or current_rank < best_level_rank:
                    best_level_rank = current_rank
                    best_level = prize_level
                    best_red_hits = red_hit_count
                    best_blue_hits = blue_hit_count
                    best_red_combo = picked_red
                    best_blue_combo = picked_blue

        if best_level is None:
            full_red = sorted({*front_dan, *front_tuo})
            full_blue = sorted({*back_dan, *back_tuo})
            red_hits = [value for value in full_red if value in actual_red]
            blue_hits = [value for value in full_blue if value in actual_blue]
            return {
                "red_hits": red_hits,
                "red_hit_count": len(red_hits),
                "blue_hits": blue_hits,
                "blue_hit_count": len(blue_hits),
                "total_hits": len(red_hits) + len(blue_hits),
                "winning_bet_count": 0,
                "bet_count": total_bets,
                "prize_breakdown": [],
            }

        return {
            "red_hits": [value for value in best_red_combo if value in actual_red],
            "red_hit_count": best_red_hits,
            "blue_hits": [value for value in best_blue_combo if value in actual_blue],
            "blue_hit_count": best_blue_hits,
            "total_hits": best_red_hits + best_blue_hits,
            "winning_bet_count": sum(prize_counter.values()),
            "bet_count": total_bets,
            "best_prize_level": best_level,
            "prize_breakdown": [
                {"prize_level": level, "count": prize_counter[level]}
                for level in dlt_prize_level_order(actual_result.get("period"))
                if prize_counter.get(level)
            ],
        }

    @classmethod
    def _calculate_dlt_compound_hit_result(cls, prediction_group: dict[str, Any], actual_result: dict[str, Any]) -> dict[str, Any]:
        red_balls = cls._normalize_dlt_zone_numbers(prediction_group.get("red_balls"), zone="front")
        blue_balls = cls._normalize_dlt_zone_numbers(prediction_group.get("blue_balls", prediction_group.get("blue_ball")), zone="back")
        actual_red = cls._normalize_dlt_zone_numbers(actual_result.get("red_balls"), zone="front")
        actual_blue = cls._normalize_dlt_zone_numbers(actual_result.get("blue_balls"), zone="back")
        if red_balls is None or blue_balls is None or actual_red is None or actual_blue is None:
            return {
                "red_hits": [],
                "red_hit_count": 0,
                "blue_hits": [],
                "blue_hit_count": 0,
                "total_hits": 0,
                "winning_bet_count": 0,
                "bet_count": 0,
                "prize_breakdown": [],
            }
        if len(red_balls) < 5 or len(blue_balls) < 2:
            return {
                "red_hits": [],
                "red_hit_count": 0,
                "blue_hits": [],
                "blue_hit_count": 0,
                "total_hits": 0,
                "winning_bet_count": 0,
                "bet_count": 0,
                "prize_breakdown": [],
            }

        prize_counter: dict[str, int] = {}
        best_level_rank: int | None = None
        best_level: str | None = None
        best_red_combo: list[str] = []
        best_blue_combo: list[str] = []
        best_red_hits = 0
        best_blue_hits = 0
        total_bets = 0

        for red_pick in combinations(red_balls, 5):
            red_hit_count = len(set(red_pick) & set(actual_red))
            for blue_pick in combinations(blue_balls, 2):
                blue_hit_count = len(set(blue_pick) & set(actual_blue))
                total_bets += 1
                prize_level = resolve_dlt_prize_level(red_hit_count, blue_hit_count, actual_result.get("period"))
                if not prize_level:
                    continue
                prize_counter[prize_level] = prize_counter.get(prize_level, 0) + 1
                current_rank = dlt_prize_level_order(actual_result.get("period")).index(prize_level)
                if best_level_rank is None or current_rank < best_level_rank:
                    best_level_rank = current_rank
                    best_level = prize_level
                    best_red_combo = sorted(red_pick)
                    best_blue_combo = sorted(blue_pick)
                    best_red_hits = red_hit_count
                    best_blue_hits = blue_hit_count

        full_red_hits = [value for value in red_balls if value in actual_red]
        full_blue_hits = [value for value in blue_balls if value in actual_blue]
        if best_level is None:
            return {
                "red_hits": full_red_hits,
                "red_hit_count": len(full_red_hits),
                "blue_hits": full_blue_hits,
                "blue_hit_count": len(full_blue_hits),
                "total_hits": len(full_red_hits) + len(full_blue_hits),
                "winning_bet_count": 0,
                "bet_count": total_bets,
                "prize_breakdown": [],
            }

        return {
            "red_hits": [value for value in best_red_combo if value in actual_red],
            "red_hit_count": best_red_hits,
            "blue_hits": [value for value in best_blue_combo if value in actual_blue],
            "blue_hit_count": best_blue_hits,
            "total_hits": best_red_hits + best_blue_hits,
            "winning_bet_count": sum(prize_counter.values()),
            "bet_count": total_bets,
            "best_prize_level": best_level,
            "prize_breakdown": [
                {"prize_level": level, "count": prize_counter[level]}
                for level in dlt_prize_level_order(actual_result.get("period"))
                if prize_counter.get(level)
            ],
        }

    @staticmethod
    def _calculate_pl3_trend_hit_count(prediction_group: dict[str, Any], actual_result: dict[str, Any]) -> int:
        play_type = str(prediction_group.get("play_type") or "direct").strip().lower()
        actual_digits = normalize_digit_balls(actual_result.get("digits", actual_result.get("red_balls", [])))
        if play_type == "direct_sum":
            sum_value = prediction_group.get("sum_value")
            try:
                predicted_sum = int(str(sum_value).strip())
            except (TypeError, ValueError):
                return 0
            actual_sum = sum(int(item) for item in actual_digits if str(item).isdigit())
            return 1 if predicted_sum == actual_sum else 0
        digits = normalize_digit_balls(prediction_group.get("digits", prediction_group.get("red_balls", [])))

        if play_type == "direct":
            return sum(1 for digit, actual in zip(digits, actual_digits) if digit == actual)

        actual_digit_set = set(actual_digits)
        if play_type == "group3":
            seen_digits: set[str] = set()
            hit_count = 0
            for digit in digits:
                if not digit or digit in seen_digits:
                    continue
                seen_digits.add(digit)
                if digit in actual_digit_set:
                    hit_count += 1
            return hit_count

        return sum(1 for digit in digits if digit in actual_digit_set)

    @staticmethod
    def _calculate_pl5_trend_hit_count(prediction_group: dict[str, Any], actual_result: dict[str, Any]) -> int:
        actual_digits = normalize_digit_balls(actual_result.get("digits", actual_result.get("red_balls", [])))
        digits = normalize_digit_balls(prediction_group.get("digits", prediction_group.get("red_balls", [])))
        return sum(1 for digit, actual in zip(digits, actual_digits) if digit == actual)

    def _resolve_trend_hit_count(
        self,
        prediction_group: dict[str, Any],
        actual_result: dict[str, Any],
        lottery_code: str,
        *,
        hit_result: dict[str, Any] | None = None,
    ) -> int:
        normalized_code = normalize_lottery_code(lottery_code or prediction_group.get("lottery_code") or actual_result.get("lottery_code"))
        if normalized_code == "pl3":
            return self._calculate_pl3_trend_hit_count(prediction_group, actual_result)
        if normalized_code == "pl5":
            return self._calculate_pl5_trend_hit_count(prediction_group, actual_result)
        if hit_result is not None:
            return int(hit_result.get("total_hits") or 0)
        return int(prediction_group.get("total_hits") or 0)

    @classmethod
    def _resolve_prediction_group_cost(cls, prediction_group: dict[str, Any], lottery_code: str) -> int:
        normalized_code = normalize_lottery_code(lottery_code or prediction_group.get("lottery_code") or "dlt")
        if normalized_code == "dlt":
            play_type = str(prediction_group.get("play_type") or "").strip().lower()
            if play_type == "dlt_compound":
                red_balls = cls._normalize_dlt_zone_numbers(prediction_group.get("red_balls"), zone="front") or []
                blue_balls = cls._normalize_dlt_zone_numbers(prediction_group.get("blue_balls", prediction_group.get("blue_ball")), zone="back") or []
                if len(red_balls) < 5 or len(blue_balls) < 2:
                    return cls.BET_COST
                bet_count = math.comb(len(red_balls), 5) * math.comb(len(blue_balls), 2)
                return max(1, int(bet_count)) * cls.BET_COST
            if play_type != "dlt_dantuo":
                return cls.BET_COST
            front_dan = cls._normalize_dlt_zone_numbers(prediction_group.get("front_dan", []), zone="front") or []
            front_tuo = cls._normalize_dlt_zone_numbers(prediction_group.get("front_tuo", []), zone="front") or []
            back_dan = cls._normalize_dlt_zone_numbers(prediction_group.get("back_dan", []), zone="back") or []
            back_tuo = cls._normalize_dlt_zone_numbers(prediction_group.get("back_tuo", []), zone="back") or []
            front_pick_count = 5 - len(front_dan)
            back_pick_count = 2 - len(back_dan)
            if front_pick_count < 0 or back_pick_count < 0:
                return cls.BET_COST
            if len(front_tuo) < front_pick_count or len(back_tuo) < back_pick_count:
                return cls.BET_COST
            bet_count = math.comb(len(front_tuo), front_pick_count) * math.comb(len(back_tuo), back_pick_count)
            return max(1, int(bet_count)) * cls.BET_COST
        if normalized_code != "pl3":
            return cls.BET_COST
        play_type = str(prediction_group.get("play_type") or "direct").strip().lower()
        if play_type != "direct_sum":
            return cls.BET_COST
        sum_value = prediction_group.get("sum_value")
        try:
            normalized_sum = int(str(sum_value).strip())
        except (TypeError, ValueError):
            return cls.BET_COST
        return int(cls.PL3_DIRECT_SUM_COST_RULES.get(normalized_sum, cls.BET_COST))

    @classmethod
    def _resolve_prediction_group_bet_count(
        cls,
        prediction_group: dict[str, Any],
        lottery_code: str,
        *,
        hit_result: dict[str, Any] | None = None,
    ) -> int:
        normalized_code = normalize_lottery_code(lottery_code or prediction_group.get("lottery_code") or "dlt")
        if normalized_code != "dlt":
            return 1
        play_type = str(prediction_group.get("play_type") or "").strip().lower()
        if play_type == "dlt_compound":
            if isinstance(hit_result, dict):
                resolved = int(hit_result.get("bet_count") or 0)
                if resolved > 0:
                    return resolved
            return max(1, cls._resolve_prediction_group_cost(prediction_group, normalized_code) // cls.BET_COST)
        if play_type != "dlt_dantuo":
            return 1
        if isinstance(hit_result, dict):
            resolved = int(hit_result.get("bet_count") or 0)
            if resolved > 0:
                return resolved
        return max(1, cls._resolve_prediction_group_cost(prediction_group, normalized_code) // cls.BET_COST)

    @staticmethod
    def _normalize_dlt_zone_numbers(value: Any, *, zone: str) -> list[str] | None:
        if not isinstance(value, list):
            return None
        valid_range = range(1, 36) if zone == "front" else range(1, 13)
        normalized = sorted({str(item).zfill(2) for item in value})
        if any((not number.isdigit()) or int(number) not in valid_range for number in normalized):
            return None
        return normalized

    def _build_history_list_payload(
        self,
        limit: int | None = None,
        offset: int = 0,
        lottery_code: str = "dlt",
        strategy_filters: list[str] | None = None,
        play_type_filters: list[str] | None = None,
        strategy_match_mode: str = "all",
        include_inactive_models: bool = True,
    ) -> dict[str, Any]:
        started_at = perf_counter()
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_strategy_filters = self._normalize_strategy_filters(strategy_filters)
        if normalized_code in {"pl3", "pl5"}:
            normalized_strategy_filters = []
        normalized_play_type_filters = self._normalize_play_type_filters(play_type_filters)
        normalized_strategy_match_mode = str(strategy_match_mode or "all").strip().lower() or "all"
        db_metrics: dict[str, Any] = {}
        has_post_filters = bool(normalized_strategy_filters or normalized_play_type_filters or (not include_inactive_models))
        fetch_limit = None if has_post_filters else limit
        fetch_offset = 0 if has_post_filters else offset
        if hasattr(self.prediction_repository, "list_history_record_summaries_with_metrics"):
            summary_payload = self.prediction_repository.list_history_record_summaries_with_metrics(
                limit=fetch_limit,
                offset=fetch_offset,
                lottery_code=lottery_code,
            )
            summary_records = summary_payload.get("records", [])
            db_metrics = summary_payload.get("metrics", {})
        else:
            summary_records = self.prediction_repository.list_history_record_summaries(limit=fetch_limit, offset=fetch_offset, lottery_code=lottery_code)
        aggregate_started_at = perf_counter()
        records = [
            self._annotate_history_summary_record(
                record,
                strategy_filters=normalized_strategy_filters,
                play_type_filters=normalized_play_type_filters,
                strategy_match_mode=normalized_strategy_match_mode,
            )
            for record in summary_records
        ]
        if not include_inactive_models:
            active_model_codes = self._get_active_model_codes()
            records = [
                {
                    **record,
                    "models": self._filter_models_by_active_status(record.get("models", []), active_model_codes),
                }
                for record in records
            ]
        records = [record for record in records if record.get("models")]
        if has_post_filters:
            filtered_total_count = len(records)
            if offset:
                records = records[offset:]
            if limit is not None:
                records = records[:limit]
        else:
            filtered_total_count = self.prediction_repository.count_history_records(lottery_code=lottery_code)
        score_profiles = self._build_score_profiles(records)
        payload = {
            "lottery_code": normalized_code,
            "predictions_history": [self._build_history_summary(record, score_profiles) for record in records],
            "total_count": filtered_total_count,
            "model_stats": self._build_model_stats(records, score_profiles),
            "strategy_options": [] if normalized_code in {"pl3", "pl5"} else self._list_history_strategy_options(
                lottery_code=lottery_code,
                records=records,
                prefer_records=not include_inactive_models,
            ),
        }
        aggregate_duration_ms = round((perf_counter() - aggregate_started_at) * 1000, 2)
        total_duration_ms = round((perf_counter() - started_at) * 1000, 2)
        self.logger.info(
            "Built prediction history list payload",
            extra={
                "context": {
                    "limit": limit,
                    "offset": offset,
                    "db_query_ms": db_metrics.get("db_query_ms"),
                    "service_aggregate_ms": aggregate_duration_ms,
                    "total_duration_ms": total_duration_ms,
                    "strategy_filter_count": len(normalized_strategy_filters),
                    "play_type_filter_count": len(normalized_play_type_filters),
                    "strategy_match_mode": normalized_strategy_match_mode,
                    "batch_count": db_metrics.get("batch_count", len(summary_records)),
                    "model_run_count": db_metrics.get("model_run_count"),
                    "group_metric_count": db_metrics.get("group_metric_count"),
                    "returned_count": len(payload["predictions_history"]),
                    "filtered_total_count": filtered_total_count,
                    "model_stat_count": len(payload["model_stats"]),
                }
            },
        )
        return payload

    def _annotate_history_summary_record(
        self,
        payload: dict[str, Any],
        *,
        strategy_filters: list[str] | None = None,
        play_type_filters: list[str] | None = None,
        strategy_match_mode: str = "all",
    ) -> dict[str, Any]:
        actual_result = payload.get("actual_result")
        if not actual_result:
            return {**payload, "period_summary": self._empty_period_summary()}
        lottery_code = normalize_lottery_code(payload.get("lottery_code") or actual_result.get("lottery_code") or "dlt")
        normalized_strategy_filters = self._normalize_strategy_filters(strategy_filters)
        normalized_play_type_filters = self._normalize_play_type_filters(play_type_filters)

        annotated_models: list[dict[str, Any]] = []
        total_bet_count = 0
        total_cost_amount = 0
        total_prize_amount = 0

        for model in payload.get("models", []):
            group_metrics = [dict(metric) for metric in (model.get("group_metrics") or [])]
            if normalized_play_type_filters:
                play_type_filter_set = set(normalized_play_type_filters)
                group_metrics = [
                    metric
                    for metric in group_metrics
                    if str(metric.get("play_type") or "direct").strip().lower() in play_type_filter_set
                ]
            if normalized_strategy_filters:
                strategy_labels = {
                    self._normalize_strategy_label(metric.get("strategy"))
                    for metric in group_metrics
                }
                if strategy_match_mode == "all" and not all(strategy in strategy_labels for strategy in normalized_strategy_filters):
                    continue
                group_metrics = [
                    {
                        **metric,
                        "strategy": self._normalize_strategy_label(metric.get("strategy")),
                    }
                    for metric in group_metrics
                    if self._normalize_strategy_label(metric.get("strategy")) in normalized_strategy_filters
                ]
            if not group_metrics:
                continue

            winning_bet_count = 0
            prize_amount = 0
            best_group = None
            best_hit_count = 0
            model_cost_amount = 0
            model_bet_count = 0

            for metric in group_metrics:
                group_play_type = str(metric.get("play_type") or "").strip().lower()
                if lottery_code in {"pl3", "pl5"} or (lottery_code == "dlt" and group_play_type == "dlt_dantuo"):
                    hit_result = self.calculate_hit_result(metric, actual_result, lottery_code=lottery_code)
                else:
                    base_hit_result = {
                        "red_hit_count": int(metric.get("red_hit_count") or 0),
                        "blue_hit_count": int(metric.get("blue_hit_count") or 0),
                        "total_hits": int(metric.get("total_hits") or 0),
                    }
                    hit_result_from_metric = metric.get("hit_result")
                    hit_result = (
                        {**base_hit_result, **hit_result_from_metric}
                        if isinstance(hit_result_from_metric, dict)
                        else base_hit_result
                    )
                    hit_result["digit_hit_count"] = int(hit_result.get("digit_hit_count") or 0)
                trend_hit_count = self._resolve_trend_hit_count(metric, actual_result, lottery_code, hit_result=hit_result)
                group_id = int(metric.get("group_id") or 0)
                if best_group is None or trend_hit_count > best_hit_count or (
                    trend_hit_count == best_hit_count and group_id and group_id < best_group
                ):
                    best_group = group_id or None
                    best_hit_count = trend_hit_count
                prize_level = self.resolve_prize_level(hit_result, actual_result=actual_result, prediction_group=metric)
                group_cost = self._resolve_prediction_group_cost(metric, lottery_code)
                group_bet_count = self._resolve_prediction_group_bet_count(metric, lottery_code, hit_result=hit_result)
                model_cost_amount += group_cost
                model_bet_count += group_bet_count
                if lottery_code == "dlt" and group_play_type == "dlt_dantuo":
                    breakdown = hit_result.get("prize_breakdown") if isinstance(hit_result.get("prize_breakdown"), list) else []
                    group_winning_bet_count = 0
                    group_prize_amount = 0
                    for item in breakdown:
                        level = str((item or {}).get("prize_level") or "").strip()
                        count = int((item or {}).get("count") or 0)
                        if not level or count <= 0:
                            continue
                        prize_info = self.resolve_prize_amount(actual_result, level)
                        group_winning_bet_count += count
                        group_prize_amount += int(prize_info["amount"] or 0) * count
                    winning_bet_count += group_winning_bet_count
                    prize_amount += group_prize_amount
                else:
                    prize_info = self.resolve_prize_amount(actual_result, prize_level)
                    if prize_info["amount"] > 0:
                        winning_bet_count += 1
                        prize_amount += prize_info["amount"]

            bet_count = model_bet_count
            cost_amount = model_cost_amount
            annotated_models.append(
                {
                    **model,
                    "best_group": best_group,
                    "best_hit_count": best_hit_count,
                    "bet_count": bet_count,
                    "cost_amount": cost_amount,
                    "winning_bet_count": winning_bet_count,
                    "prize_amount": prize_amount,
                    "hit_period_win": winning_bet_count > 0,
                    "win_rate_by_period": 1.0 if winning_bet_count > 0 else 0.0,
                    "win_rate_by_bet": (winning_bet_count / bet_count) if bet_count else 0.0,
                }
            )
            total_bet_count += bet_count
            total_cost_amount += cost_amount
            total_prize_amount += prize_amount

        return {
            **payload,
            "models": annotated_models,
            "period_summary": {
                "total_bet_count": total_bet_count,
                "total_cost_amount": total_cost_amount,
                "total_prize_amount": total_prize_amount,
            },
        }

    def _annotate_history_record(self, payload: dict[str, Any] | None) -> dict[str, Any] | None:
        if not payload:
            return None
        actual_result = payload.get("actual_result")
        if not actual_result:
            return {**payload, "period_summary": self._empty_period_summary()}
        lottery_code = normalize_lottery_code(payload.get("lottery_code") or actual_result.get("lottery_code") or "dlt")

        annotated_models: list[dict[str, Any]] = []
        total_bet_count = 0
        total_cost_amount = 0
        total_prize_amount = 0

        for model in payload.get("models", []):
            predictions = []
            winning_bet_count = 0
            prize_amount = 0
            best_group = None
            best_hit_count = 0
            model_bet_count = 0
            for group in model.get("predictions", []):
                hit_result = group.get("hit_result") or self.calculate_hit_result(group, actual_result, lottery_code=lottery_code)
                trend_hit_count = self._resolve_trend_hit_count(group, actual_result, lottery_code, hit_result=hit_result)
                group_id = int(group.get("group_id") or 0)
                if best_group is None or trend_hit_count > best_hit_count or (
                    trend_hit_count == best_hit_count and group_id and group_id < best_group
                ):
                    best_group = group_id or None
                    best_hit_count = trend_hit_count
                prize_level = self.resolve_prize_level(hit_result, actual_result=actual_result, prediction_group=group)
                group_cost = self._resolve_prediction_group_cost(group, lottery_code)
                group_bet_count = self._resolve_prediction_group_bet_count(group, lottery_code, hit_result=hit_result)
                group_play_type = str(group.get("play_type") or "").strip().lower()
                if lottery_code == "dlt" and group_play_type == "dlt_dantuo":
                    breakdown = hit_result.get("prize_breakdown") if isinstance(hit_result.get("prize_breakdown"), list) else []
                    group_winning_bet_count = 0
                    group_prize_amount = 0
                    for item in breakdown:
                        level = str((item or {}).get("prize_level") or "").strip()
                        count = int((item or {}).get("count") or 0)
                        if not level or count <= 0:
                            continue
                        prize_info = self.resolve_prize_amount(actual_result, level)
                        group_winning_bet_count += count
                        group_prize_amount += int(prize_info["amount"] or 0) * count
                    prize_source = "none"
                    if group_prize_amount > 0:
                        prize_source = "fallback" if any(
                            self.resolve_prize_amount(actual_result, str((item or {}).get("prize_level") or "").strip()).get("source") == "fallback"
                            for item in breakdown
                            if int((item or {}).get("count") or 0) > 0
                        ) else "official"
                    prize_level = str(hit_result.get("best_prize_level") or prize_level or "") or None
                else:
                    prize_info = self.resolve_prize_amount(actual_result, prize_level)
                    group_winning_bet_count = 1 if prize_info["amount"] > 0 else 0
                    group_prize_amount = int(prize_info["amount"] or 0)
                    prize_source = prize_info["source"]
                predictions.append(
                    {
                        **group,
                        "hit_result": hit_result,
                        "cost_amount": group_cost,
                        "prize_level": prize_level,
                        "prize_amount": group_prize_amount,
                        "prize_source": prize_source,
                    }
                )
                winning_bet_count += group_winning_bet_count
                prize_amount += group_prize_amount
                model_bet_count += group_bet_count

            bet_count = model_bet_count
            cost_amount = sum(int(group.get("cost_amount") or self.BET_COST) for group in predictions)
            annotated_models.append(
                {
                    **model,
                    "predictions": predictions,
                    "best_group": best_group,
                    "best_hit_count": best_hit_count,
                    "bet_count": bet_count,
                    "cost_amount": cost_amount,
                    "winning_bet_count": winning_bet_count,
                    "prize_amount": prize_amount,
                    "hit_period_win": winning_bet_count > 0,
                    "win_rate_by_period": 1.0 if winning_bet_count > 0 else 0.0,
                    "win_rate_by_bet": (winning_bet_count / bet_count) if bet_count else 0.0,
                }
            )
            total_bet_count += bet_count
            total_cost_amount += cost_amount
            total_prize_amount += prize_amount

        return {
            **payload,
            "models": annotated_models,
            "period_summary": {
                "total_bet_count": total_bet_count,
                "total_cost_amount": total_cost_amount,
                "total_prize_amount": total_prize_amount,
            },
        }

    def _build_history_summary(self, record: dict[str, Any], score_profiles: dict[str, dict[str, Any]]) -> dict[str, Any]:
        return {
            "prediction_date": self.serialize_prediction_date(record.get("prediction_date")),
            "target_period": record.get("target_period", ""),
            "actual_result": record.get("actual_result"),
            "period_summary": record.get("period_summary") or self._empty_period_summary(),
            "models": [
                {
                    "model_id": model.get("model_id"),
                    "prediction_play_mode": self._infer_prediction_play_mode(model),
                    "model_name": model.get("model_name"),
                    "model_provider": model.get("model_provider"),
                    "model_version": model.get("model_version"),
                    "model_api_model": model.get("model_api_model"),
                    "best_group": model.get("best_group"),
                    "best_hit_count": model.get("best_hit_count"),
                    "bet_count": int(model.get("bet_count") or len(model.get("predictions", []))),
                    "cost_amount": int(model.get("cost_amount") or 0),
                    "winning_bet_count": int(model.get("winning_bet_count") or 0),
                    "prize_amount": int(model.get("prize_amount") or 0),
                    "hit_period_win": bool(model.get("hit_period_win")),
                    "win_rate_by_period": float(model.get("win_rate_by_period") or 0),
                    "win_rate_by_bet": float(model.get("win_rate_by_bet") or 0),
                    "score_profile": self._get_model_score_profile(score_profiles, model),
                }
                for model in record.get("models", [])
            ],
        }

    @classmethod
    def _infer_prediction_play_mode(cls, model: dict[str, Any]) -> str:
        explicit_mode = str(model.get("prediction_play_mode") or "").strip().lower()
        if explicit_mode == "compound":
            return "compound"
        if explicit_mode == "dantuo":
            return "dantuo"
        if explicit_mode == "direct_sum":
            return "direct_sum"
        play_types: set[str] = set()
        for key in ("predictions", "group_metrics"):
            groups = model.get(key)
            if not isinstance(groups, list):
                continue
            for group in groups:
                if not isinstance(group, dict):
                    continue
                play_type = str(group.get("play_type") or "").strip().lower()
                if play_type:
                    play_types.add(play_type)
        if "dlt_dantuo" in play_types:
            return "dantuo"
        if "dlt_compound" in play_types:
            return "compound"
        if "direct_sum" in play_types:
            return "direct_sum"
        if explicit_mode == "direct":
            return "direct"
        return "direct"

    @classmethod
    def _build_model_identity_key(cls, model: dict[str, Any]) -> str:
        model_id = str(model.get("model_id") or "").strip()
        if not model_id:
            return ""
        play_mode = cls._infer_prediction_play_mode(model)
        return f"{model_id}::{play_mode}"

    def _get_model_score_profile(self, score_profiles: dict[str, dict[str, Any]], model: dict[str, Any]) -> dict[str, Any]:
        model_key = self._build_model_identity_key(model)
        if model_key and model_key in score_profiles:
            return score_profiles[model_key]
        model_id = str(model.get("model_id") or "")
        return score_profiles.get(model_id, self._empty_score_profile())

    def _build_model_stats(self, records: list[dict[str, Any]], score_profiles: dict[str, dict[str, Any]] | None = None) -> list[dict[str, Any]]:
        stats: dict[str, dict[str, Any]] = {}
        for record in records:
            for model in record.get("models", []):
                model_id = str(model.get("model_id") or "")
                if not model_id:
                    continue
                prediction_play_mode = self._infer_prediction_play_mode(model)
                model_key = f"{model_id}::{prediction_play_mode}"
                entry = stats.setdefault(
                    model_key,
                    {
                        "model_id": model_id,
                        "prediction_play_mode": prediction_play_mode,
                        "model_name": model.get("model_name") or model_id,
                        "periods": 0,
                        "winning_periods": 0,
                        "bet_count": 0,
                        "winning_bet_count": 0,
                        "cost_amount": 0,
                        "prize_amount": 0,
                    },
                )
                entry["periods"] += 1
                entry["winning_periods"] += 1 if model.get("hit_period_win") else 0
                entry["bet_count"] += int(model.get("bet_count") or 0)
                entry["winning_bet_count"] += int(model.get("winning_bet_count") or 0)
                entry["cost_amount"] += int(model.get("cost_amount") or 0)
                entry["prize_amount"] += int(model.get("prize_amount") or 0)

        result = []
        for entry in stats.values():
            periods = int(entry["periods"] or 0)
            bet_count = int(entry["bet_count"] or 0)
            result.append(
                {
                    **entry,
                    "win_rate_by_period": (entry["winning_periods"] / periods) if periods else 0,
                    "win_rate_by_bet": (entry["winning_bet_count"] / bet_count) if bet_count else 0,
                    "score_profile": self._get_model_score_profile(score_profiles or {}, entry),
                }
            )
        result.sort(
            key=lambda item: (
                int(item.get("score_profile", {}).get("overall_score", 0)),
                item["prize_amount"],
                item["win_rate_by_period"],
                item["model_name"],
            ),
            reverse=True,
        )
        return result

    def _get_current_model_score_profiles(self, lottery_code: str = "dlt") -> dict[str, dict[str, Any]]:
        normalized_code = normalize_lottery_code(lottery_code)

        def load_profiles() -> dict[str, dict[str, Any]]:
            if hasattr(self.prediction_repository, "list_history_record_summaries_with_metrics"):
                summary_payload = self.prediction_repository.list_history_record_summaries_with_metrics(
                    limit=120,
                    offset=0,
                    lottery_code=normalized_code,
                )
                summary_records = summary_payload.get("records", [])
            else:
                summary_records = self.prediction_repository.list_history_record_summaries(
                    limit=120,
                    offset=0,
                    lottery_code=normalized_code,
                )
            records = [self._annotate_history_summary_record(record) for record in summary_records]
            records = [record for record in records if record.get("models")]
            return self._build_score_profiles(records)

        return runtime_cache.get_or_set(
            f"predictions:{normalized_code}:score-profiles:current",
            ttl_seconds=120,
            loader=load_profiles,
        )

    def _build_score_profiles(self, records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        grouped: dict[str, list[dict[str, Any]]] = {}
        model_names: dict[str, str] = {}
        for record in records:
            for model in record.get("models", []):
                model_id = str(model.get("model_id") or "")
                if not model_id:
                    continue
                model_key = self._build_model_identity_key(model)
                if not model_key:
                    continue
                model_names[model_key] = str(model.get("model_name") or model_id)
                grouped.setdefault(model_key, []).append(
                    self._build_record_performance(record, model)
                )

        result: dict[str, dict[str, Any]] = {}
        for model_key, performance_records in grouped.items():
            recent_records = performance_records[: self.RECENT_SCORE_WINDOW]
            recent_window = self._build_score_window(recent_records)
            long_term_window = self._build_score_window(performance_records)
            component_scores = {
                "profit": self._merge_window_score(recent_window["profit_score"], long_term_window["profit_score"]),
                "hit_rate": self._merge_window_score(recent_window["hit_score"], long_term_window["hit_score"]),
                "stability": self._merge_window_score(recent_window["stability_score"], long_term_window["stability_score"]),
                "ceiling": self._merge_window_score(recent_window["ceiling_score"], long_term_window["ceiling_score"]),
                "floor": self._merge_window_score(recent_window["floor_score"], long_term_window["floor_score"]),
            }
            result[model_key] = {
                "overall_score": self._merge_window_score(recent_window["overall_score"], long_term_window["overall_score"]),
                "per_bet_score": self._merge_window_score(recent_window["per_bet_score"], long_term_window["per_bet_score"]),
                "per_period_score": self._merge_window_score(recent_window["per_period_score"], long_term_window["per_period_score"]),
                "recent_score": int(recent_window["overall_score"]),
                "long_term_score": int(long_term_window["overall_score"]),
                "component_scores": component_scores,
                "recent_window": recent_window,
                "long_term_window": long_term_window,
                "best_period_snapshot": recent_window["best_period"] if recent_window["best_period"].get("net_profit", 0) >= long_term_window["best_period"].get("net_profit", 0) else long_term_window["best_period"],
                "worst_period_snapshot": recent_window["worst_period"] if recent_window["worst_period"].get("net_profit", 0) <= long_term_window["worst_period"].get("net_profit", 0) else long_term_window["worst_period"],
                "sample_size_periods": len(performance_records),
                "sample_size_bets": sum(int(item.get("bet_count") or 0) for item in performance_records),
                "model_name": model_names.get(model_key, model_key),
            }
        return result

    def _build_record_performance(self, record: dict[str, Any], model: dict[str, Any]) -> dict[str, Any]:
        cost_amount = int(model.get("cost_amount") or 0)
        prize_amount = int(model.get("prize_amount") or 0)
        net_profit = prize_amount - cost_amount
        bet_count = int(model.get("bet_count") or 0)
        winning_bet_count = int(model.get("winning_bet_count") or 0)
        return {
            "target_period": str(record.get("target_period") or ""),
            "prediction_date": str(record.get("prediction_date") or ""),
            "bet_count": bet_count,
            "winning_bet_count": winning_bet_count,
            "cost_amount": cost_amount,
            "prize_amount": prize_amount,
            "net_profit": net_profit,
            "roi": (net_profit / cost_amount) if cost_amount else 0,
            "best_hit_count": int(model.get("best_hit_count") or 0),
            "hit_rate_by_period": 1.0 if model.get("hit_period_win") else 0.0,
            "hit_rate_by_bet": (winning_bet_count / bet_count) if bet_count else 0.0,
        }

    def _build_score_window(self, records: list[dict[str, Any]]) -> dict[str, Any]:
        if not records:
            empty = self._empty_score_window()
            return empty

        periods = len(records)
        bets = sum(int(item.get("bet_count") or 0) for item in records)
        total_cost = sum(int(item.get("cost_amount") or 0) for item in records)
        total_prize = sum(int(item.get("prize_amount") or 0) for item in records)
        total_net = total_prize - total_cost
        period_hit_rate = sum(float(item.get("hit_rate_by_period") or 0) for item in records) / periods
        bet_hit_rate = (
            sum(int(item.get("winning_bet_count") or 0) for item in records) / bets if bets else 0
        )
        avg_best_hit_rate = sum((int(item.get("best_hit_count") or 0) / 7) for item in records) / periods
        roi = (total_net / total_cost) if total_cost else 0
        period_rois = [float(item.get("roi") or 0) for item in records]
        avg_period_roi = sum(period_rois) / periods
        period_roi_std = pstdev(period_rois) if len(period_rois) > 1 else 0
        losing_period_ratio = sum(1 for item in records if int(item.get("net_profit") or 0) < 0) / periods
        best_period = max(records, key=lambda item: (int(item.get("net_profit") or 0), int(item.get("best_hit_count") or 0)))
        worst_period = min(records, key=lambda item: (int(item.get("net_profit") or 0), int(item.get("best_hit_count") or 0)))

        profit_score = self._bounded_center_score(roi * 0.65 + avg_period_roi * 0.35, scale=1.5)
        hit_score = self._clamp_score((period_hit_rate * 0.55 + bet_hit_rate * 0.25 + avg_best_hit_rate * 0.20) * 100)
        stability_score = self._clamp_score(
            (
                1
                - min(1.0, period_roi_std / 2.0) * 0.45
                - losing_period_ratio * 0.35
                - min(1.0, max(0.0, -float(worst_period.get("roi") or 0)) / 1.5) * 0.20
            )
            * 100
        )
        ceiling_score = self._clamp_score(
            self._positive_score(float(best_period.get("roi") or 0), scale=2.0) * 0.55
            + float(best_period.get("hit_rate_by_bet") or 0) * 100 * 0.20
            + (int(best_period.get("best_hit_count") or 0) / 7) * 100 * 0.25
        )
        floor_score = self._clamp_score(
            self._inverse_negative_score(float(worst_period.get("roi") or 0), scale=1.5) * 0.70
            + float(worst_period.get("hit_rate_by_bet") or 0) * 100 * 0.30
        )
        per_bet_score = self._clamp_score(bet_hit_rate * 100 * 0.45 + profit_score * 0.35 + stability_score * 0.20)
        per_period_score = self._clamp_score(period_hit_rate * 100 * 0.40 + profit_score * 0.25 + stability_score * 0.20 + floor_score * 0.15)
        overall_score = self._clamp_score(
            profit_score * 0.28
            + hit_score * 0.22
            + stability_score * 0.22
            + ceiling_score * 0.16
            + floor_score * 0.12
        )

        return {
            "overall_score": overall_score,
            "per_bet_score": per_bet_score,
            "per_period_score": per_period_score,
            "profit_score": profit_score,
            "hit_score": hit_score,
            "stability_score": stability_score,
            "ceiling_score": ceiling_score,
            "floor_score": floor_score,
            "periods": periods,
            "bets": bets,
            "hit_rate_by_period": round(period_hit_rate, 4),
            "hit_rate_by_bet": round(bet_hit_rate, 4),
            "cost_amount": total_cost,
            "prize_amount": total_prize,
            "net_profit": total_net,
            "roi": round(roi, 4),
            "avg_period_roi": round(avg_period_roi, 4),
            "best_period": self._serialize_snapshot(best_period),
            "worst_period": self._serialize_snapshot(worst_period),
        }

    @staticmethod
    def _serialize_snapshot(record: dict[str, Any]) -> dict[str, Any]:
        return {
            "target_period": str(record.get("target_period") or ""),
            "prediction_date": str(record.get("prediction_date") or ""),
            "bet_count": int(record.get("bet_count") or 0),
            "winning_bet_count": int(record.get("winning_bet_count") or 0),
            "cost_amount": int(record.get("cost_amount") or 0),
            "prize_amount": int(record.get("prize_amount") or 0),
            "net_profit": int(record.get("net_profit") or 0),
            "roi": round(float(record.get("roi") or 0), 4),
            "best_hit_count": int(record.get("best_hit_count") or 0),
        }

    @staticmethod
    def _bounded_center_score(value: float, *, scale: float) -> int:
        return PredictionService._clamp_score((math.tanh(value / scale) + 1) * 50)

    @staticmethod
    def _positive_score(value: float, *, scale: float) -> float:
        return math.tanh(max(0.0, value) / scale) * 100

    @staticmethod
    def _inverse_negative_score(value: float, *, scale: float) -> float:
        return (1 - math.tanh(max(0.0, -value) / scale)) * 100

    @staticmethod
    def _merge_window_score(recent: int | float, long_term: int | float) -> int:
        return PredictionService._clamp_score(float(recent) * 0.6 + float(long_term) * 0.4)

    @staticmethod
    def _clamp_score(value: float) -> int:
        return max(0, min(100, int(round(value))))

    def _empty_score_window(self) -> dict[str, Any]:
        return {
            "overall_score": 0,
            "per_bet_score": 0,
            "per_period_score": 0,
            "profit_score": 0,
            "hit_score": 0,
            "stability_score": 0,
            "ceiling_score": 0,
            "floor_score": 0,
            "periods": 0,
            "bets": 0,
            "hit_rate_by_period": 0,
            "hit_rate_by_bet": 0,
            "cost_amount": 0,
            "prize_amount": 0,
            "net_profit": 0,
            "roi": 0,
            "avg_period_roi": 0,
            "best_period": self._serialize_snapshot({}),
            "worst_period": self._serialize_snapshot({}),
        }

    def _empty_score_profile(self) -> dict[str, Any]:
        return {
            "overall_score": 0,
            "per_bet_score": 0,
            "per_period_score": 0,
            "recent_score": 0,
            "long_term_score": 0,
            "component_scores": {
                "profit": 0,
                "hit_rate": 0,
                "stability": 0,
                "ceiling": 0,
                "floor": 0,
            },
            "recent_window": self._empty_score_window(),
            "long_term_window": self._empty_score_window(),
            "best_period_snapshot": self._serialize_snapshot({}),
            "worst_period_snapshot": self._serialize_snapshot({}),
            "sample_size_periods": 0,
            "sample_size_bets": 0,
        }

    @classmethod
    def _normalize_strategy_label(cls, value: Any) -> str:
        text = str(value or "").strip()
        return text or cls.DEFAULT_STRATEGY_LABEL

    @classmethod
    def _normalize_strategy_filters(cls, values: list[str] | None) -> list[str]:
        if not values:
            return []
        normalized = [cls._normalize_strategy_label(value) for value in values if str(value or "").strip()]
        return list(dict.fromkeys(normalized))

    @staticmethod
    def _normalize_play_type_filters(values: list[str] | None) -> list[str]:
        if not values:
            return []
        allowed_play_types = {"direct", "direct_sum", "group3", "group6", "dlt_dantuo", "dlt_compound"}
        normalized = [str(value or "").strip().lower() for value in values]
        return [play_type for play_type in dict.fromkeys(normalized) if play_type in allowed_play_types]

    def _list_history_strategy_options(
        self,
        *,
        lottery_code: str,
        records: list[dict[str, Any]],
        prefer_records: bool = False,
    ) -> list[str]:
        list_strategy_options = getattr(self.prediction_repository, "list_history_strategy_options", None)
        if callable(list_strategy_options) and not prefer_records:
            options = list_strategy_options(lottery_code=lottery_code)
            if isinstance(options, (list, tuple, set)):
                normalized = [self._normalize_strategy_label(option) for option in options]
                return sorted(dict.fromkeys(normalized))
        options = {
            self._normalize_strategy_label(group.get("strategy"))
            for record in records
            for model in record.get("models", [])
            for group in (model.get("group_metrics") or [])
        }
        return sorted(options)

    @staticmethod
    def _filter_models_by_active_status(models: list[dict[str, Any]], active_model_codes: set[str]) -> list[dict[str, Any]]:
        return [model for model in models if str(model.get("model_id") or "") in active_model_codes]

    def _get_active_model_codes(self) -> set[str]:
        return self.model_repository.list_active_model_codes()

    @classmethod
    def resolve_prize_level(
        cls,
        hit_result: dict[str, Any],
        *,
        actual_result: dict[str, Any] | None = None,
        prediction_group: dict[str, Any] | None = None,
    ) -> str | None:
        lottery_code = normalize_lottery_code((actual_result or {}).get("lottery_code") or "dlt")
        if lottery_code == "pl3":
            play_type = str((prediction_group or {}).get("play_type") or "direct").strip().lower()
            if play_type == "direct_sum":
                is_exact_match = hit_result.get("is_exact_match")
                if is_exact_match is None:
                    is_exact_match = int(hit_result.get("digit_hit_count") or 0) == 1
                return "和值" if bool(is_exact_match) else None
            if play_type == "direct":
                is_exact_match = hit_result.get("is_exact_match")
                if is_exact_match is None:
                    is_exact_match = int(hit_result.get("digit_hit_count") or 0) == 3
                return "直选" if bool(is_exact_match) else None
            if int(hit_result.get("digit_hit_count") or 0) != 3:
                return None
            digits = normalize_group_digits((prediction_group or {}).get("digits", []))
            if len(set(digits)) == 2:
                return "组选3"
            if len(set(digits)) == 3:
                return "组选6"
            return None
        if lottery_code == "pl5":
            is_exact_match = hit_result.get("is_exact_match")
            if is_exact_match is None:
                is_exact_match = int(hit_result.get("digit_hit_count") or 0) == 5
            return "直选" if bool(is_exact_match) else None
        play_type = str((prediction_group or {}).get("play_type") or "").strip().lower()
        if play_type in {"dlt_dantuo", "dlt_compound"}:
            best_prize_level = str(hit_result.get("best_prize_level") or "").strip()
            if best_prize_level:
                return best_prize_level
            if int(hit_result.get("winning_bet_count") or 0) <= 0:
                return None
        red_hit_count = int(hit_result.get("red_hit_count") or 0)
        blue_hit_count = int(hit_result.get("blue_hit_count") or 0)
        return resolve_dlt_prize_level(red_hit_count, blue_hit_count, (actual_result or {}).get("period"))

    def resolve_prize_amount(self, actual_result: dict[str, Any], prize_level: str | None) -> dict[str, Any]:
        if not prize_level:
            return {"amount": 0, "source": "none"}
        lottery_code = normalize_lottery_code(actual_result.get("lottery_code") or "dlt")
        if lottery_code == "pl3" and prize_level == "和值":
            return {"amount": self.PL3_FIXED_PRIZE_RULES["和值"], "source": "fallback"}
        for prize in actual_result.get("prize_breakdown", []) or []:
            if prize.get("prize_level") == prize_level and prize.get("prize_type") == "basic":
                amount = int(prize.get("prize_amount") or 0)
                if amount > 0:
                    return {"amount": amount, "source": "official"}
        if lottery_code == "pl3" and prize_level in self.PL3_FIXED_PRIZE_RULES:
            return {"amount": self.PL3_FIXED_PRIZE_RULES[prize_level], "source": "fallback"}
        if lottery_code == "pl5" and prize_level in self.PL5_FIXED_PRIZE_RULES:
            return {"amount": self.PL5_FIXED_PRIZE_RULES[prize_level], "source": "fallback"}
        if lottery_code == "dlt":
            previous_jackpot_pool = int(actual_result.get("previous_jackpot_pool") or 0)
            if previous_jackpot_pool <= 0:
                period = str(actual_result.get("period") or "")
                if period:
                    previous_draw = self.lottery_service.get_previous_draw_by_period(period, lottery_code="dlt")
                    previous_jackpot_pool = int((previous_draw or {}).get("jackpot_pool_balance") or 0)
            amount = resolve_dlt_fallback_prize_amount(
                prize_level,
                actual_result.get("period"),
                previous_jackpot_pool,
            )
            if amount > 0:
                return {"amount": amount, "source": "fallback"}
        return {"amount": 0, "source": "missing"}

    @staticmethod
    def _empty_period_summary() -> dict[str, int]:
        return {
            "total_bet_count": 0,
            "total_cost_amount": 0,
            "total_prize_amount": 0,
        }

    @staticmethod
    def _invalidate_prediction_cache(target_period: str | None = None, lottery_code: str = "dlt") -> None:
        normalized_code = normalize_lottery_code(lottery_code)
        runtime_cache.delete(f"predictions:{normalized_code}:current")
        runtime_cache.invalidate_prefix(f"predictions:{normalized_code}:current:")
        runtime_cache.invalidate_prefix(f"predictions:{normalized_code}:history:full:")
        runtime_cache.invalidate_prefix(f"predictions:{normalized_code}:history:list:")
        if target_period:
            runtime_cache.delete(f"predictions:{normalized_code}:history:detail:{target_period}")
        else:
            runtime_cache.invalidate_prefix(f"predictions:{normalized_code}:history:detail:")
