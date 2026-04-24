from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from statistics import mean
from threading import Lock
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
DEFAULT_EXPERT_HISTORY_PARALLELISM = 3


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

    def generate_for_expert(
        self,
        *,
        expert_code: str,
        lottery_code: str = "dlt",
        mode: str = "current",
        overwrite: bool = False,
        prompt_history_period_count: int | None = None,
        parallelism: int | None = None,
        start_period: str | None = None,
        end_period: str | None = None,
        recent_period_count: int | None = None,
        progress_callback=None,
    ) -> dict[str, Any]:
        ensure_schema()
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_mode = str(mode or "current").strip().lower()
        if normalized_mode not in {"current", "history"}:
            raise ValueError("不支持的生成模式")
        if normalized_code != "dlt":
            raise ValueError("专家预测首版仅支持大乐透")

        expert = self.expert_service.get_expert(expert_code)
        if not expert or bool(expert.get("is_deleted")):
            raise KeyError(expert_code)
        if not bool(expert.get("is_active")):
            raise ValueError("已停用专家不能生成预测数据")
        if str(expert.get("lottery_code") or "dlt").strip().lower() != normalized_code:
            raise ValueError("生成彩种必须与专家配置彩种一致")

        prompt_count = self.prediction_generation_service._normalize_prompt_history_period_count(prompt_history_period_count)
        if normalized_mode == "current":
            target_period = self._resolve_target_period(normalized_code)
            prediction_date = datetime.now().strftime("%Y-%m-%d")
            history = self.lottery_service.get_recent_draws(limit=prompt_count, lottery_code=normalized_code)
            summary = self._build_single_expert_summary(
                expert=expert,
                lottery_code=normalized_code,
                mode=normalized_mode,
                target_period=target_period,
                parallelism=1,
            )
            if progress_callback:
                progress_callback(dict(summary))
            self._generate_one_expert_period(
                expert=expert,
                lottery_code=normalized_code,
                target_period=target_period,
                prediction_date=prediction_date,
                history_context=history,
                overwrite=overwrite,
                summary=summary,
            )
            summary["task_completed_count"] = 1
            runtime_cache.invalidate_prefix("experts:public:")
            if progress_callback:
                progress_callback(dict(summary))
            return summary

        history_data = self.prediction_generation_service._load_lottery_history(normalized_code)
        resolved_start, resolved_end = self.prediction_generation_service._resolve_history_period_range(
            history_data,
            start_period=str(start_period or ""),
            end_period=str(end_period or ""),
            recent_period_count=recent_period_count,
        )
        period_map = self.prediction_generation_service._build_period_map(history_data)
        sorted_periods = sorted((int(period), period) for period in period_map if str(period).isdigit())
        target_periods = [str(period) for period in range(int(resolved_start), int(resolved_end) + 1)]
        max_workers = self.prediction_generation_service._normalize_parallelism(
            parallelism,
            task_count=len(target_periods),
            default_parallelism=DEFAULT_EXPERT_HISTORY_PARALLELISM,
        )
        summary = self._build_single_expert_summary(
            expert=expert,
            lottery_code=normalized_code,
            mode=normalized_mode,
            target_period=f"{resolved_start}-{resolved_end}",
            parallelism=max_workers,
        )
        summary["task_total_count"] = len(target_periods)
        summary_lock = Lock()

        def emit_progress_snapshot() -> None:
            if progress_callback:
                progress_callback(dict(summary))

        emit_progress_snapshot()

        def run_period(target_period: str) -> tuple[str, str, str | None]:
            if target_period not in period_map:
                return "failed", target_period, "历史开奖不存在"
            target_int = int(target_period)
            history_context = [
                period_map[period]
                for period_int, period in sorted(sorted_periods, reverse=True)
                if period_int < target_int
            ][:prompt_count]
            if not history_context:
                return "failed", target_period, "缺少可用于Prompt的历史开奖"
            actual_result = period_map[target_period]
            prediction_date = self.prediction_generation_service._make_prediction_date(actual_result.get("date"))
            local_summary = self._build_single_expert_summary(
                expert=expert,
                lottery_code=normalized_code,
                mode=normalized_mode,
                target_period=target_period,
                parallelism=max_workers,
            )
            self._generate_one_expert_period(
                expert=expert,
                lottery_code=normalized_code,
                target_period=target_period,
                prediction_date=prediction_date,
                history_context=history_context,
                overwrite=overwrite,
                summary=local_summary,
            )
            if local_summary["processed_count"] > 0:
                return "processed", target_period, None
            if local_summary["skipped_count"] > 0:
                return "skipped", target_period, None
            failed = local_summary.get("failed_details") or []
            reason = str((failed[0] or {}).get("reason") or "专家预测生成失败") if failed else "专家预测生成失败"
            return "failed", target_period, reason

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(run_period, target_period): target_period for target_period in target_periods}
            for future in as_completed(futures):
                target_period = futures[future]
                try:
                    status, finished_period, reason = future.result()
                except Exception as exc:
                    status, finished_period, reason = "failed", target_period, str(exc)
                    self.logger.exception(
                        "Expert history generation worker crashed",
                        extra={"context": {"expert_code": expert_code, "target_period": target_period}},
                    )
                with summary_lock:
                    summary["task_completed_count"] = int(summary.get("task_completed_count") or 0) + 1
                    if status == "processed":
                        summary["processed_count"] += 1
                        summary["processed_periods"].append(finished_period)
                    elif status == "skipped":
                        summary["skipped_count"] += 1
                        summary["skipped_periods"].append(finished_period)
                    else:
                        summary["failed_count"] += 1
                        summary["failed_periods"].append(finished_period)
                        summary["failed_details"].append({"target_period": finished_period, "reason": reason or "专家预测生成失败"})
                    emit_progress_snapshot()

        runtime_cache.invalidate_prefix("experts:public:")
        return summary

    def _build_single_expert_summary(
        self,
        *,
        expert: dict[str, Any],
        lottery_code: str,
        mode: str,
        target_period: str,
        parallelism: int,
    ) -> dict[str, Any]:
        expert_code = str(expert.get("expert_code") or "")
        return {
            "lottery_code": lottery_code,
            "mode": mode,
            "expert_code": expert_code,
            "expert_name": expert.get("display_name"),
            "target_period": target_period,
            "parallelism": parallelism,
            "selected_count": 1,
            "processed_count": 0,
            "skipped_count": 0,
            "failed_count": 0,
            "processed_experts": [],
            "failed_experts": [],
            "processed_periods": [],
            "skipped_periods": [],
            "failed_periods": [],
            "failed_details": [],
            "task_total_count": 1,
            "task_completed_count": 0,
        }

    def _generate_one_expert_period(
        self,
        *,
        expert: dict[str, Any],
        lottery_code: str,
        target_period: str,
        prediction_date: str,
        history_context: list[dict[str, Any]],
        overwrite: bool,
        summary: dict[str, Any],
    ) -> None:
        expert_code = str(expert.get("expert_code") or "")
        batch = self.repository.upsert_batch(
            {
                "task_id": f"expert-batch-{uuid4().hex}",
                "lottery_code": lottery_code,
                "target_period": target_period,
                "prediction_date": prediction_date,
                "status": "running",
                "summary": {
                    **summary,
                    "target_period": target_period,
                },
            }
        )
        existing_result = self._find_result_for_expert(
            lottery_code=lottery_code,
            target_period=target_period,
            expert=expert,
        )
        if existing_result and str(existing_result.get("status") or "") == "succeeded" and not overwrite:
            summary["skipped_count"] += 1
            summary["skipped_periods"].append(target_period)
            self.repository.update_batch(
                str(batch.get("task_id") or ""),
                {
                    "status": "succeeded",
                    "summary": summary,
                },
            )
            return

        try:
            precompute = self._build_precompute(history_context, window_count=len(history_context))
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
                    "lottery_code": lottery_code,
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
            summary["processed_periods"].append(target_period)
            self.repository.update_batch(
                str(batch.get("task_id") or ""),
                {
                    "status": "succeeded",
                    "summary": summary,
                },
            )
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
                    "lottery_code": lottery_code,
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
            summary["failed_periods"].append(target_period)
            summary["failed_details"].append({"target_period": target_period, "reason": str(exc)})
            self.repository.update_batch(
                str(batch.get("task_id") or ""),
                {
                    "status": "failed",
                    "summary": summary,
                },
            )

    def _find_result_for_expert(self, *, lottery_code: str, target_period: str, expert: dict[str, Any]) -> dict[str, Any] | None:
        expert_id = int(expert.get("id") or 0)
        expert_code = str(expert.get("expert_code") or "")
        return next(
            (
                item
                for item in self.repository.list_results_by_period(lottery_code=lottery_code, target_period=target_period)
                if (expert_id > 0 and int(item.get("expert_id") or 0) == expert_id) or str(item.get("expert_code") or "") == expert_code
            ),
            None,
        )

    def _find_result_for_expert_code(self, *, lottery_code: str, target_period: str, expert_code: str) -> dict[str, Any] | None:
        return next(
            (
                item
                for item in self.repository.list_results_by_period(lottery_code=lottery_code, target_period=target_period)
                if str(item.get("expert_code") or "") == expert_code
            ),
            None,
        )

    def _build_actual_draw_map(self, lottery_code: str) -> dict[str, dict[str, Any]]:
        history_payload = self.lottery_service.get_history_payload(lottery_code=lottery_code)
        draw_map: dict[str, dict[str, Any]] = {}
        for draw in history_payload.get("data", []):
            if not isinstance(draw, dict):
                continue
            period = str(draw.get("period") or "").strip()
            if not period:
                continue
            raw_blue = draw.get("blue_balls") if isinstance(draw.get("blue_balls"), list) else [draw.get("blue_ball")] if draw.get("blue_ball") else []
            draw_map[period] = {
                "period": period,
                "date": draw.get("date"),
                "red_balls": sorted(str(item).zfill(2) for item in (draw.get("red_balls") or [])),
                "blue_balls": sorted(str(item).zfill(2) for item in raw_blue),
            }
        return draw_map

    def _build_tier_hits(self, tiers: dict[str, Any], actual_result: dict[str, Any]) -> dict[str, Any]:
        actual_front = {str(item).zfill(2) for item in (actual_result.get("red_balls") or [])}
        actual_back = {str(item).zfill(2) for item in (actual_result.get("blue_balls") or [])}
        result: dict[str, Any] = {}
        for tier_key in ("tier1", "tier2", "tier3", "tier4", "tier5"):
            tier = tiers.get(tier_key) if isinstance(tiers.get(tier_key), dict) else {}
            front_hits = sorted({str(item).zfill(2) for item in (tier.get("front") or [])} & actual_front)
            back_hits = sorted({str(item).zfill(2) for item in (tier.get("back") or [])} & actual_back)
            result[tier_key] = {
                "front_hit_count": len(front_hits),
                "front_hits": front_hits,
                "back_hit_count": len(back_hits),
                "back_hits": back_hits,
                "total_hit_count": len(front_hits) + len(back_hits),
            }
        return result

    @staticmethod
    def _period_sort_key(period: str) -> tuple[int, str]:
        return (int(period), period) if period.isdigit() else (0, period)

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

    def list_history_experts(
        self,
        *,
        lottery_code: str = "dlt",
        expert_code: str | None = None,
        period_query: str | None = None,
        limit: int | None = 20,
        offset: int = 0,
    ) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        if normalized_code != "dlt":
            raise ValueError("专家预测首版仅支持大乐透")
        rows = self.repository.list_history_results(
            lottery_code=normalized_code,
            expert_code=str(expert_code or "").strip() or None,
            period_query=str(period_query or "").strip() or None,
        )
        draw_map = self._build_actual_draw_map(normalized_code)
        grouped: dict[str, dict[str, Any]] = {}
        expert_options: dict[str, dict[str, Any]] = {}
        for row in rows:
            target_period = str(row.get("target_period") or "").strip()
            actual_result = draw_map.get(target_period)
            if not actual_result:
                continue
            code = str(row.get("expert_code") or "")
            expert_options[code] = {
                "expert_code": code,
                "display_name": row.get("display_name") or code,
            }
            entry = grouped.setdefault(
                target_period,
                {
                    "target_period": target_period,
                    "actual_result": actual_result,
                    "experts": [],
                },
            )
            tiers = row.get("tiers") if isinstance(row.get("tiers"), dict) else {}
            tier_hits = self._build_tier_hits(tiers, actual_result)
            best_total_hit_count = max((int(item.get("total_hit_count") or 0) for item in tier_hits.values()), default=0)
            entry["experts"].append(
                {
                    "expert_code": code,
                    "display_name": row.get("display_name") or code,
                    "bio": row.get("bio") or "",
                    "model_code": row.get("model_code") or "",
                    "generated_at": row.get("generated_at"),
                    "best_total_hit_count": best_total_hit_count,
                    "tier_hits": tier_hits,
                }
            )
        records = sorted(grouped.values(), key=lambda item: self._period_sort_key(str(item.get("target_period") or "")), reverse=True)
        total_count = len(records)
        normalized_limit = int(limit) if limit is not None else total_count
        paged_records = records[int(offset) : int(offset) + normalized_limit]
        return {
            "lottery_code": normalized_code,
            "total_count": total_count,
            "limit": normalized_limit,
            "offset": int(offset),
            "records": paged_records,
            "experts": sorted(expert_options.values(), key=lambda item: str(item.get("display_name") or "")),
        }

    def get_history_expert_detail(self, *, lottery_code: str = "dlt", target_period: str, expert_code: str) -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        if normalized_code != "dlt":
            raise ValueError("专家预测首版仅支持大乐透")
        actual_result = self._build_actual_draw_map(normalized_code).get(str(target_period).strip())
        if not actual_result:
            return None
        result = self._find_result_for_expert_code(
            lottery_code=normalized_code,
            target_period=str(target_period).strip(),
            expert_code=str(expert_code).strip(),
        )
        if not result or str(result.get("status") or "") != "succeeded":
            return None
        expert = self.expert_service.get_expert(str(expert_code).strip()) or {}
        tiers = result.get("tiers") if isinstance(result.get("tiers"), dict) else {}
        precompute = result.get("precompute") if isinstance(result.get("precompute"), dict) else {}
        process = self._build_process_detail(tiers=tiers, precompute=precompute, expert=expert) if expert else {}
        return {
            "expert_code": result.get("expert_code"),
            "display_name": result.get("display_name") or expert.get("display_name") or result.get("expert_code"),
            "bio": result.get("bio") or expert.get("bio") or "",
            "model_code": result.get("model_code") or expert.get("model_code") or "",
            "lottery_code": normalized_code,
            "target_period": str(target_period).strip(),
            "actual_result": actual_result,
            "tiers": tiers,
            "tier_hits": self._build_tier_hits(tiers, actual_result),
            "analysis": result.get("analysis") if isinstance(result.get("analysis"), dict) else {},
            "process": process,
            "generated_at": result.get("generated_at"),
        }

    def _build_current_expert_list_payload(self, lottery_code: str, target_period: str) -> dict[str, Any]:
        experts = self.expert_service.list_experts(include_deleted=False, lottery_code=lottery_code)
        result_rows = self.repository.list_results_by_period(lottery_code=lottery_code, target_period=target_period)
        result_map_by_code = {
            str(item.get("expert_code") or ""): item
            for item in result_rows
            if str(item.get("status") or "") == "succeeded"
        }
        result_map_by_id = {
            int(item.get("expert_id") or 0): item
            for item in result_rows
            if str(item.get("status") or "") == "succeeded" and int(item.get("expert_id") or 0) > 0
        }
        cards = []
        for expert in experts:
            if not bool(expert.get("is_active")) or bool(expert.get("is_deleted")):
                continue
            expert_id = int(expert.get("id") or 0)
            result = result_map_by_id.get(expert_id) or result_map_by_code.get(str(expert.get("expert_code") or ""))
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
        expert_id = int(expert.get("id") or 0)
        result = next(
            (
                item
                for item in result_rows
                if str(item.get("status") or "") == "succeeded"
                and (
                    (expert_id > 0 and int(item.get("expert_id") or 0) == expert_id)
                    or str(item.get("expert_code") or "") == expert_code
                )
            ),
            None,
        )
        if not result:
            return None
        tiers = result.get("tiers") if isinstance(result.get("tiers"), dict) else {}
        precompute = result.get("precompute") if isinstance(result.get("precompute"), dict) else {}
        process = self._build_process_detail(
            tiers=tiers,
            precompute=precompute,
            expert=expert,
        )
        return {
            "expert_code": expert.get("expert_code"),
            "display_name": expert.get("display_name"),
            "bio": expert.get("bio"),
            "model_code": expert.get("model_code"),
            "lottery_code": lottery_code,
            "target_period": target_period,
            "config": expert.get("config") if isinstance(expert.get("config"), dict) else {},
            "tiers": tiers,
            "analysis": result.get("analysis") if isinstance(result.get("analysis"), dict) else {},
            "process": process,
            "generated_at": result.get("generated_at"),
        }

    def _build_process_detail(
        self,
        *,
        tiers: dict[str, Any],
        precompute: dict[str, Any],
        expert: dict[str, Any],
    ) -> dict[str, Any]:
        tier_order = ("tier1", "tier2", "tier3", "tier4", "tier5")
        score_map_front = (precompute.get("score_map") or {}).get("front", {})
        score_map_back = (precompute.get("score_map") or {}).get("back", {})
        strategy_weights = (
            ((expert.get("config") or {}).get("strategy_preferences") if isinstance(expert.get("config"), dict) else {})
            or DEFAULT_STRATEGY_PREFERENCES
        )
        tier_trace: dict[str, Any] = {}
        number_insights: dict[str, Any] = {}

        previous_front: list[str] = []
        previous_back: list[str] = []
        for tier_key in tier_order:
            tier = tiers.get(tier_key) if isinstance(tiers.get(tier_key), dict) else {}
            current_front = sorted({str(value) for value in (tier.get("front") or []) if str(value).isdigit()}, key=lambda value: int(value))
            current_back = sorted({str(value) for value in (tier.get("back") or []) if str(value).isdigit()}, key=lambda value: int(value))
            kept_front = sorted(set(previous_front).intersection(current_front), key=lambda value: int(value)) if previous_front else []
            removed_front = sorted(set(previous_front).difference(current_front), key=lambda value: int(value)) if previous_front else []
            kept_back = sorted(set(previous_back).intersection(current_back), key=lambda value: int(value)) if previous_back else []
            removed_back = sorted(set(previous_back).difference(current_back), key=lambda value: int(value)) if previous_back else []
            tier_trace[tier_key] = {
                "front": {
                    "count": len(current_front),
                    "kept_from_previous": kept_front,
                    "removed_from_previous": removed_front,
                },
                "back": {
                    "count": len(current_back),
                    "kept_from_previous": kept_back,
                    "removed_from_previous": removed_back,
                },
            }
            number_insights[tier_key] = {
                "front": [self._build_number_insight(number, score_map_front.get(number) or {}) for number in current_front],
                "back": [self._build_number_insight(number, score_map_back.get(number) or {}) for number in current_back],
            }
            previous_front = current_front
            previous_back = current_back
        return {
            "tier_trace": tier_trace,
            "strategy_weights": {
                "miss_rebound": int(strategy_weights.get("miss_rebound", 0)),
                "hot_cold_pattern": int(strategy_weights.get("hot_cold_pattern", 0)),
                "trend_deviation": int(strategy_weights.get("trend_deviation", 0)),
                "stability": int(strategy_weights.get("stability", 0)),
            },
            "number_insights": number_insights,
        }

    @staticmethod
    def _build_number_insight(number: str, row: dict[str, Any]) -> dict[str, Any]:
        temperature = str(row.get("temperature") or "warm")
        current_omit = int(row.get("current_omit") or 0)
        avg_omit = float(row.get("avg_omit") or 0.0)
        trend_score = float(row.get("trend_score") or 0.0)
        if temperature == "cold" and current_omit <= avg_omit:
            reason = "冷态回补信号增强"
        elif avg_omit > 0 and current_omit < avg_omit:
            reason = "小遗漏优先筛入"
        elif trend_score > 0:
            reason = "走势偏差向上"
        elif temperature == "hot":
            reason = "热态延续稳定"
        else:
            reason = "结构稳定度优先"
        return {
            "number": number,
            "temperature": temperature,
            "current_omit": current_omit,
            "avg_omit": round(avg_omit, 2),
            "trend_score": round(trend_score, 4),
            "reason": reason,
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

    def _build_precompute(self, history: list[dict[str, Any]], *, window_count: int = 50) -> dict[str, Any]:
        valid_history = [item for item in history if isinstance(item, dict) and item.get("red_balls")]
        window = valid_history[:window_count]
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
