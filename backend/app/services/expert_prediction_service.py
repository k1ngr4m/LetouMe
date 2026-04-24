from __future__ import annotations

import json
from datetime import datetime
from statistics import mean
from typing import Any
from uuid import uuid4

from backend.app.cache import runtime_cache
from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.lotteries import normalize_lottery_code
from backend.app.repositories.expert_repository import ExpertRepository
from backend.app.services.expert_service import ExpertService
from backend.app.services.lottery_service import LotteryService
from backend.app.services.prediction_generation_service import PredictionGenerationService
from backend.app.services.prediction_service import PredictionService


PRIME_NUMBERS_FRONT = {2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31}
DEFAULT_STRATEGY_PREFERENCES = {
    "miss_rebound": 40,
    "hot_cold_pattern": 20,
    "trend_deviation": 20,
    "stability": 20,
}


class ExpertPredictionService:
    def __init__(
        self,
        *,
        repository: ExpertRepository | None = None,
        expert_service: ExpertService | None = None,
        lottery_service: LotteryService | None = None,
        prediction_service: PredictionService | None = None,
        prediction_generation_service: PredictionGenerationService | None = None,
    ) -> None:
        self.repository = repository or ExpertRepository()
        self.expert_service = expert_service or ExpertService(repository=self.repository)
        self.lottery_service = lottery_service or LotteryService()
        self.prediction_service = prediction_service or PredictionService()
        self.prediction_generation_service = prediction_generation_service or PredictionGenerationService()
        self.logger = get_logger("services.expert_prediction")

    def generate_current_for_all(
        self,
        *,
        lottery_code: str = "dlt",
        progress_callback=None,
    ) -> dict[str, Any]:
        ensure_schema()
        normalized_code = normalize_lottery_code(lottery_code)
        if normalized_code != "dlt":
            raise ValueError("专家预测首版仅支持大乐透")
        experts = [
            item
            for item in self.expert_service.list_experts(include_deleted=False, lottery_code=normalized_code)
            if bool(item.get("is_active")) and not bool(item.get("is_deleted"))
        ]
        target_period = self._resolve_target_period(normalized_code)
        prediction_date = datetime.now().strftime("%Y-%m-%d")
        batch = self.repository.upsert_batch(
            {
                "task_id": f"expert-batch-{uuid4().hex}",
                "lottery_code": normalized_code,
                "target_period": target_period,
                "prediction_date": prediction_date,
                "status": "running",
                "summary": {
                    "selected_count": len(experts),
                    "processed_count": 0,
                    "failed_count": 0,
                    "skipped_count": 0,
                    "processed_experts": [],
                    "failed_experts": [],
                    "target_period": target_period,
                },
            }
        )
        summary = {
            "lottery_code": normalized_code,
            "target_period": target_period,
            "selected_count": len(experts),
            "processed_count": 0,
            "failed_count": 0,
            "skipped_count": 0,
            "processed_experts": [],
            "failed_experts": [],
        }
        if progress_callback:
            progress_callback(dict(summary))
        if not experts:
            summary["skipped_count"] = 1
            self.repository.update_batch(
                str(batch.get("task_id") or ""),
                {
                    "status": "failed",
                    "summary": summary,
                },
            )
            if progress_callback:
                progress_callback(dict(summary))
            return summary

        history = self.lottery_service.get_recent_draws(limit=50, lottery_code=normalized_code)
        for expert in experts:
            expert_code = str(expert.get("expert_code") or "")
            try:
                precompute = self._build_precompute(history)
                prompt = self._build_prompt(
                    expert=expert,
                    precompute=precompute,
                    target_period=target_period,
                    prediction_date=prediction_date,
                )
                parsed = self._generate_first_tier_with_model(expert=expert, prompt=prompt)
                tier1_front, tier1_back = self._resolve_tier1_numbers(parsed=parsed, precompute=precompute)
                tiers = self._build_nested_tiers(
                    tier1_front=tier1_front,
                    tier1_back=tier1_back,
                    precompute=precompute,
                    expert=expert,
                )
                analysis = self._build_analysis(parsed=parsed, expert=expert, precompute=precompute)
                self.repository.upsert_result(
                    {
                        "batch_id": int(batch.get("id") or 0),
                        "expert_id": int(expert.get("id") or 0),
                        "expert_code": expert_code,
                        "lottery_code": normalized_code,
                        "target_period": target_period,
                        "status": "succeeded",
                        "error_message": None,
                        "prompt_snapshot": prompt,
                        "precompute": precompute,
                        "tiers": tiers,
                        "analysis": analysis,
                        "generated_at": datetime.now(),
                    }
                )
                summary["processed_count"] += 1
                summary["processed_experts"].append(expert_code)
            except Exception as exc:
                self.logger.exception(
                    "Expert prediction generation failed",
                    extra={"context": {"expert_code": expert_code, "target_period": target_period}},
                )
                self.repository.upsert_result(
                    {
                        "batch_id": int(batch.get("id") or 0),
                        "expert_id": int(expert.get("id") or 0),
                        "expert_code": expert_code,
                        "lottery_code": normalized_code,
                        "target_period": target_period,
                        "status": "failed",
                        "error_message": str(exc),
                        "prompt_snapshot": "",
                        "precompute": {},
                        "tiers": {},
                        "analysis": {},
                        "generated_at": datetime.now(),
                    }
                )
                summary["failed_count"] += 1
                summary["failed_experts"].append({"expert_code": expert_code, "reason": str(exc)})
            if progress_callback:
                progress_callback(dict(summary))

        final_status = "succeeded"
        if summary["processed_count"] == 0:
            final_status = "failed"
        elif summary["failed_count"] > 0:
            final_status = "partial_succeeded"
        self.repository.update_batch(
            str(batch.get("task_id") or ""),
            {
                "status": final_status,
                "summary": summary,
            },
        )
        runtime_cache.invalidate_prefix("experts:public:")
        return summary

    def list_current_experts(self, *, lottery_code: str = "dlt") -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        target_period = self._resolve_target_period(normalized_code)
        cache_key = f"experts:public:list:{normalized_code}:{target_period}"
        return runtime_cache.get_or_set(
            cache_key,
            ttl_seconds=60,
            loader=lambda: self._build_current_expert_list_payload(normalized_code, target_period),
        )

    def get_current_expert_detail(self, *, lottery_code: str = "dlt", expert_code: str) -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        target_period = self._resolve_target_period(normalized_code)
        cache_key = f"experts:public:detail:{normalized_code}:{target_period}:{str(expert_code).strip()}"
        return runtime_cache.get_or_set(
            cache_key,
            ttl_seconds=60,
            loader=lambda: self._build_current_expert_detail_payload(normalized_code, target_period, str(expert_code).strip()),
        )

    def _build_current_expert_list_payload(self, lottery_code: str, target_period: str) -> dict[str, Any]:
        experts = self.expert_service.list_experts(include_deleted=False, lottery_code=lottery_code)
        result_rows = self.repository.list_results_by_period(lottery_code=lottery_code, target_period=target_period)
        result_map = {
            str(item.get("expert_code") or ""): item
            for item in result_rows
            if str(item.get("status") or "") == "succeeded"
        }
        cards = []
        for expert in experts:
            if not bool(expert.get("is_active")) or bool(expert.get("is_deleted")):
                continue
            result = result_map.get(str(expert.get("expert_code") or ""))
            if not result:
                continue
            config = expert.get("config") if isinstance(expert.get("config"), dict) else {}
            cards.append(
                {
                    "expert_code": expert.get("expert_code"),
                    "display_name": expert.get("display_name"),
                    "bio": expert.get("bio"),
                    "lottery_code": lottery_code,
                    "target_period": target_period,
                    "model_code": expert.get("model_code"),
                    "dlt_front_weights": config.get("dlt_front_weights") or {},
                    "dlt_back_weights": config.get("dlt_back_weights") or {},
                    "strategy_preferences": config.get("strategy_preferences") or {},
                    "generated_at": result.get("generated_at"),
                }
            )
        return {
            "lottery_code": lottery_code,
            "target_period": target_period,
            "experts": cards,
        }

    def _build_current_expert_detail_payload(self, lottery_code: str, target_period: str, expert_code: str) -> dict[str, Any] | None:
        expert = self.expert_service.get_expert(expert_code)
        if not expert or bool(expert.get("is_deleted")) or not bool(expert.get("is_active")):
            return None
        result_rows = self.repository.list_results_by_period(lottery_code=lottery_code, target_period=target_period)
        result = next(
            (
                item
                for item in result_rows
                if str(item.get("expert_code") or "") == expert_code and str(item.get("status") or "") == "succeeded"
            ),
            None,
        )
        if not result:
            return None
        return {
            "expert_code": expert.get("expert_code"),
            "display_name": expert.get("display_name"),
            "bio": expert.get("bio"),
            "model_code": expert.get("model_code"),
            "lottery_code": lottery_code,
            "target_period": target_period,
            "config": expert.get("config") if isinstance(expert.get("config"), dict) else {},
            "tiers": result.get("tiers") if isinstance(result.get("tiers"), dict) else {},
            "analysis": result.get("analysis") if isinstance(result.get("analysis"), dict) else {},
            "generated_at": result.get("generated_at"),
        }

    def _resolve_target_period(self, lottery_code: str) -> str:
        current_payload = self.prediction_service.get_current_payload(lottery_code=lottery_code, include_inactive_models=False)
        target_period = str(current_payload.get("target_period") or "").strip()
        if target_period:
            return target_period
        history_payload = self.lottery_service.get_history_payload(limit=1, lottery_code=lottery_code)
        next_draw = history_payload.get("next_draw") if isinstance(history_payload.get("next_draw"), dict) else {}
        target_period = str((next_draw or {}).get("next_period") or "").strip()
        if not target_period:
            raise ValueError("无法确定当前目标期号")
        return target_period

    def _generate_first_tier_with_model(self, *, expert: dict[str, Any], prompt: str) -> dict[str, Any]:
        model_code = str(expert.get("model_code") or "").strip()
        model_def = self.prediction_generation_service._get_model_definition(model_code, lottery_code="dlt")
        model = self.prediction_generation_service._prepare_model(model_def)
        raw = model.predict(prompt)
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str):
            text = raw.strip()
            if text.startswith("```"):
                text = text.strip("`")
                if "\n" in text:
                    text = text.split("\n", 1)[1]
            return json.loads(text)
        raise ValueError("模型返回内容无法解析为JSON")

    def _resolve_tier1_numbers(self, *, parsed: dict[str, Any], precompute: dict[str, Any]) -> tuple[list[str], list[str]]:
        tiers = parsed.get("tiers") if isinstance(parsed.get("tiers"), dict) else {}
        tier1 = tiers.get("tier1") if isinstance(tiers, dict) and isinstance(tiers.get("tier1"), dict) else {}
        front_candidates = (
            tier1.get("front")
            or parsed.get("front_pool")
            or parsed.get("front_numbers")
            or []
        )
        back_candidates = (
            tier1.get("back")
            or parsed.get("back_pool")
            or parsed.get("back_numbers")
            or []
        )
        front = self._normalize_zone_numbers(front_candidates, zone="front")
        back = self._normalize_zone_numbers(back_candidates, zone="back")
        front = self._fill_zone_numbers(front, zone="front", expected=15, precompute=precompute)
        back = self._fill_zone_numbers(back, zone="back", expected=5, precompute=precompute)
        return front, back

    def _build_nested_tiers(
        self,
        *,
        tier1_front: list[str],
        tier1_back: list[str],
        precompute: dict[str, Any],
        expert: dict[str, Any],
    ) -> dict[str, Any]:
        front_scored = self._sort_by_score(tier1_front, zone="front", precompute=precompute, expert=expert)
        back_scored = self._sort_by_score(tier1_back, zone="back", precompute=precompute, expert=expert)
        tier1 = {"front": sorted(tier1_front), "back": sorted(tier1_back)}
        tier2 = {"front": sorted(front_scored[:12]), "back": sorted(back_scored[:5])}
        tier3 = {"front": sorted(front_scored[:10]), "back": sorted(back_scored[:5])}
        tier4 = {"front": sorted(front_scored[:9]), "back": sorted(back_scored[:3])}
        tier5 = {"front": sorted(front_scored[:5]), "back": sorted(back_scored[:2])}
        return {
            "tier1": tier1,
            "tier2": tier2,
            "tier3": tier3,
            "tier4": tier4,
            "tier5": tier5,
        }

    def _sort_by_score(self, numbers: list[str], *, zone: str, precompute: dict[str, Any], expert: dict[str, Any]) -> list[str]:
        score_map = precompute.get("score_map", {}).get(zone, {})
        strategy_preferences = (
            ((expert.get("config") or {}).get("strategy_preferences") if isinstance(expert.get("config"), dict) else {})
            or DEFAULT_STRATEGY_PREFERENCES
        )
        miss_w = int(strategy_preferences.get("miss_rebound", 0))
        hot_w = int(strategy_preferences.get("hot_cold_pattern", 0))
        trend_w = int(strategy_preferences.get("trend_deviation", 0))
        stability_w = int(strategy_preferences.get("stability", 0))
        total_w = max(1, miss_w + hot_w + trend_w + stability_w)

        def score_value(number: str) -> float:
            row = score_map.get(number, {})
            miss_signal = float(row.get("miss_signal") or 0.0)
            hot_signal = float(row.get("hot_signal") or 0.0)
            trend_signal = float(row.get("trend_signal") or 0.0)
            stability_signal = float(row.get("stability_signal") or 0.0)
            return (
                miss_signal * miss_w
                + hot_signal * hot_w
                + trend_signal * trend_w
                + stability_signal * stability_w
            ) / total_w

        return sorted(numbers, key=lambda value: (-score_value(value), int(value)))

    def _fill_zone_numbers(self, numbers: list[str], *, zone: str, expected: int, precompute: dict[str, Any]) -> list[str]:
        normalized = list(dict.fromkeys(numbers))
        if len(normalized) >= expected:
            return sorted(normalized[:expected])
        score_rows = precompute.get("zone_stats", {}).get(zone, [])
        for row in score_rows:
            value = str(row.get("number") or "")
            if value and value not in normalized:
                normalized.append(value)
            if len(normalized) >= expected:
                break
        return sorted(normalized[:expected])

    @staticmethod
    def _normalize_zone_numbers(values: Any, *, zone: str) -> list[str]:
        if not isinstance(values, list):
            return []
        maximum = 35 if zone == "front" else 12
        result: list[str] = []
        for value in values:
            text = str(value or "").strip()
            if not text.isdigit():
                continue
            number = int(text)
            if number < 1 or number > maximum:
                continue
            result.append(str(number).zfill(2))
        return sorted(list(dict.fromkeys(result)))

    def _build_prompt(
        self,
        *,
        expert: dict[str, Any],
        precompute: dict[str, Any],
        target_period: str,
        prediction_date: str,
    ) -> str:
        config = expert.get("config") if isinstance(expert.get("config"), dict) else {}
        payload = {
            "expert_name": expert.get("display_name"),
            "expert_bio": expert.get("bio"),
            "target_period": target_period,
            "prediction_date": prediction_date,
            "weights": {
                "dlt_front": config.get("dlt_front_weights") or {},
                "dlt_back": config.get("dlt_back_weights") or {},
                "strategy_preferences": config.get("strategy_preferences") or {},
            },
            "precompute": precompute,
            "rules": {
                "tier1": "front 15 + back 5",
                "output_json_schema": {
                    "front_pool": ["01", "02"],
                    "back_pool": ["01", "02"],
                    "analysis": {
                        "strategy_summary": "string",
                        "technical_style": "string",
                    },
                },
            },
        }
        return (
            "你是中国体彩大乐透专家顾问，请根据输入数据返回号码池。\n"
            "要求：\n"
            "1) 必须输出严格 JSON；\n"
            "2) front_pool 返回15个前区号码(01-35)；\n"
            "3) back_pool 返回5个后区号码(01-12)；\n"
            "4) 号码去重、升序；\n"
            "5) analysis.strategy_summary 和 analysis.technical_style 提供简要说明。\n"
            f"输入数据：\n{json.dumps(payload, ensure_ascii=False)}"
        )

    @staticmethod
    def _build_analysis(parsed: dict[str, Any], expert: dict[str, Any], precompute: dict[str, Any]) -> dict[str, Any]:
        raw_analysis = parsed.get("analysis")
        if isinstance(raw_analysis, dict):
            return {
                "strategy_summary": str(raw_analysis.get("strategy_summary") or "").strip(),
                "technical_style": str(raw_analysis.get("technical_style") or "").strip(),
            }
        hot_front = [row.get("number") for row in (precompute.get("hot_numbers", {}).get("front") or [])[:3]]
        return {
            "strategy_summary": f"{expert.get('display_name')}优先关注小遗漏与结构平衡信号。",
            "technical_style": f"当前前区热点参考: {'/'.join(str(item) for item in hot_front if item)}",
        }

    def _build_precompute(self, history: list[dict[str, Any]]) -> dict[str, Any]:
        valid_history = [item for item in history if isinstance(item, dict) and item.get("red_balls")]
        window = valid_history[:50]
        front_rows = self._build_zone_stats(window, zone="front")
        back_rows = self._build_zone_stats(window, zone="back")
        shape_metrics = self._build_shape_metrics(window)
        score_map = {
            "front": {str(item["number"]): item for item in front_rows},
            "back": {str(item["number"]): item for item in back_rows},
        }
        return {
            "history_period_count": len(window),
            "zone_stats": {
                "front": front_rows,
                "back": back_rows,
            },
            "hot_numbers": {
                "front": [item for item in front_rows if item.get("temperature") == "hot"][:10],
                "back": [item for item in back_rows if item.get("temperature") == "hot"][:6],
            },
            "cold_numbers": {
                "front": [item for item in front_rows if item.get("temperature") == "cold"][:10],
                "back": [item for item in back_rows if item.get("temperature") == "cold"][:6],
            },
            "shape_metrics": shape_metrics,
            "score_map": score_map,
        }

    def _build_zone_stats(self, history: list[dict[str, Any]], *, zone: str) -> list[dict[str, Any]]:
        max_number = 35 if zone == "front" else 12
        key = "red_balls" if zone == "front" else "blue_balls"
        frequencies = {idx: 0 for idx in range(1, max_number + 1)}
        recent10 = {idx: 0 for idx in range(1, max_number + 1)}
        recent30 = {idx: 0 for idx in range(1, max_number + 1)}
        sequences: dict[int, list[int]] = {idx: [] for idx in range(1, max_number + 1)}

        for draw_index, draw in enumerate(history):
            numbers = {
                int(str(item))
                for item in (draw.get(key) or [])
                if str(item).isdigit()
            }
            for number in range(1, max_number + 1):
                hit = 1 if number in numbers else 0
                frequencies[number] += hit
                sequences[number].append(hit)
                if draw_index < 10:
                    recent10[number] += hit
                if draw_index < 30:
                    recent30[number] += hit

        frequency_values = list(frequencies.values()) or [0]
        max_freq = max(frequency_values) or 1
        min_freq = min(frequency_values)
        hot_threshold = max(1, int(len(history) * 0.22))
        cold_threshold = max(0, int(len(history) * 0.08))

        rows: list[dict[str, Any]] = []
        for number in range(1, max_number + 1):
            seq = sequences[number]
            current_omit = self._calculate_current_omit(seq)
            max_omit = self._calculate_max_omit(seq)
            avg_omit = self._calculate_avg_omit(seq)
            trend = (recent10[number] / 10 if history else 0) - (recent30[number] / 30 if history else 0)
            hot_signal = (frequencies[number] - min_freq) / max(1, max_freq - min_freq)
            miss_signal = max(0.0, (avg_omit - current_omit) / max(1.0, avg_omit))
            stability_signal = max(0.0, 1 - min(1.0, abs(current_omit - avg_omit) / max(1.0, avg_omit)))
            trend_signal = (trend + 1) / 2
            if frequencies[number] >= hot_threshold:
                temperature = "hot"
            elif frequencies[number] <= cold_threshold:
                temperature = "cold"
            else:
                temperature = "warm"
            rows.append(
                {
                    "number": str(number).zfill(2),
                    "frequency": frequencies[number],
                    "current_omit": current_omit,
                    "max_omit": max_omit,
                    "avg_omit": round(avg_omit, 2),
                    "temperature": temperature,
                    "trend_score": round(trend, 4),
                    "hot_signal": round(hot_signal, 4),
                    "miss_signal": round(miss_signal, 4),
                    "stability_signal": round(stability_signal, 4),
                    "trend_signal": round(trend_signal, 4),
                }
            )
        return sorted(rows, key=lambda item: (-int(item["frequency"]), int(item["number"])))

    @staticmethod
    def _calculate_current_omit(seq: list[int]) -> int:
        omit = 0
        for value in seq:
            if value == 1:
                return omit
            omit += 1
        return omit

    @staticmethod
    def _calculate_max_omit(seq: list[int]) -> int:
        current = 0
        maximum = 0
        for value in seq:
            if value == 1:
                maximum = max(maximum, current)
                current = 0
            else:
                current += 1
        maximum = max(maximum, current)
        return maximum

    @staticmethod
    def _calculate_avg_omit(seq: list[int]) -> float:
        gaps: list[int] = []
        current = 0
        for value in seq:
            if value == 1:
                gaps.append(current)
                current = 0
            else:
                current += 1
        gaps.append(current)
        return float(mean(gaps)) if gaps else 0.0

    def _build_shape_metrics(self, history: list[dict[str, Any]]) -> dict[str, Any]:
        ac_values: list[int] = []
        sum_values: list[int] = []
        odd_even_deviation: list[float] = []
        prime_composite_deviation: list[float] = []
        for draw in history:
            front = [int(str(value)) for value in (draw.get("red_balls") or []) if str(value).isdigit()]
            if len(front) != 5:
                continue
            ac_values.append(self._calculate_ac(front))
            front_sum = sum(front)
            sum_values.append(front_sum)
            odd_count = sum(1 for value in front if value % 2 == 1)
            odd_even_deviation.append(abs(odd_count - 2.5))
            prime_count = sum(1 for value in front if value in PRIME_NUMBERS_FRONT)
            prime_composite_deviation.append(abs(prime_count - 2.5))
        return {
            "ac_distribution": ac_values,
            "sum_trend": sum_values,
            "sum_average": round(mean(sum_values), 2) if sum_values else 0,
            "odd_even_deviation_avg": round(mean(odd_even_deviation), 4) if odd_even_deviation else 0,
            "prime_composite_deviation_avg": round(mean(prime_composite_deviation), 4) if prime_composite_deviation else 0,
        }

    @staticmethod
    def _calculate_ac(numbers: list[int]) -> int:
        diffs = {abs(a - b) for idx, a in enumerate(numbers) for b in numbers[idx + 1 :]}
        return len(diffs) - (len(numbers) - 1)


expert_prediction_service = ExpertPredictionService()
