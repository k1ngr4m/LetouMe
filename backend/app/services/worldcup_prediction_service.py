from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.repositories.model_repository import ModelRepository
from backend.app.repositories.worldcup_repository import WORLDCUP_COMPLIANCE_NOTICE, WorldCupRepository
from backend.app.services.worldcup_news_search_service import WorldCupNewsSearchService
from backend.core.model_config import load_model_registry
from backend.core.model_factory import ModelFactory


WORLDCUP_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "worldcup_prompt.md"
WORLDCUP_PLAY_TYPES = {"win_draw_win", "handicap_win_draw_win", "total_goals", "correct_score", "half_full_time"}


class WorldCupPredictionService:
    def __init__(
        self,
        repository: WorldCupRepository | None = None,
        model_repository: ModelRepository | None = None,
        news_search_service: WorldCupNewsSearchService | None = None,
    ) -> None:
        self.repository = repository or WorldCupRepository()
        self.model_repository = model_repository or ModelRepository()
        self.news_search_service = news_search_service or WorldCupNewsSearchService()
        self.logger = get_logger("services.worldcup_prediction")

    def generate_for_model(
        self,
        *,
        model_code: str,
        play_type: str = "all",
        overwrite: bool = False,
        match_date: str | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        ensure_schema()
        model_record = self._validate_model(model_code)
        model_def = load_model_registry().get(model_code)
        if not model_def.supports_lottery("worldcup"):
            raise ValueError("该模型未配置世界杯")
        rows = self.repository.list_recent_matches_with_odds(limit=200, match_date=match_date)
        match_context = self._build_match_context(rows, play_type=play_type)
        summary = {
            "lottery_code": "worldcup",
            "mode": "current",
            "model_code": model_code,
            "match_date": match_date,
            "processed_count": 0,
            "skipped_count": 0,
            "failed_count": 0,
            "failed_periods": [],
            "completed_count": 0,
            "failed_details": [],
        }
        if not match_context:
            summary["skipped_count"] = 1
            if progress_callback:
                progress_callback(summary)
            return summary
        match_context = self._enrich_match_context_with_news(match_context)
        prompt = WORLDCUP_PROMPT_PATH.read_text(encoding="utf-8").format(
            prediction_date=datetime.now().strftime("%Y-%m-%d"),
            model_name=model_def.name,
            match_context=json.dumps(match_context, ensure_ascii=False, indent=2),
        )
        try:
            model = ModelFactory().create(model_def)
            ok, message = model.health_check()
            if not ok:
                raise ValueError(f"模型健康检查失败: {message}")
            raw_payload = model.predict(prompt)
            recommendations = self._normalize_ai_recommendations(
                raw_payload,
                match_context=match_context,
                model_code=model_code,
                model_name=str(model_record.get("display_name") or model_def.name),
                overwrite=overwrite,
            )
            saved_count = self.repository.upsert_recommendations(recommendations)
            summary["processed_count"] = saved_count
            summary["completed_count"] = saved_count
            if not saved_count:
                summary["skipped_count"] = 1
            if progress_callback:
                progress_callback(summary)
            return summary
        except Exception as exc:
            summary["failed_count"] = 1
            summary["failed_details"] = [{"model_code": model_code, "error": str(exc)}]
            if progress_callback:
                progress_callback(summary)
            raise

    def _validate_model(self, model_code: str) -> dict[str, Any]:
        model = self.model_repository.get_model(model_code)
        if not model:
            raise KeyError(model_code)
        if bool(model.get("is_deleted")):
            raise ValueError("已删除模型不能生成预测数据")
        if not bool(model.get("is_active")):
            raise ValueError("已停用模型不能生成预测数据")
        if "worldcup" not in (model.get("lottery_codes") or []):
            raise ValueError("该模型未配置世界杯")
        return model

    def _build_match_context(self, rows: list[dict[str, Any]], *, play_type: str) -> list[dict[str, Any]]:
        selected_play_types = WORLDCUP_PLAY_TYPES if play_type == "all" else {play_type}
        matches: dict[str, dict[str, Any]] = {}
        for row in rows:
            row_play_type = str(row.get("play_type") or "")
            if row_play_type not in selected_play_types:
                continue
            match_id = str(row.get("match_id") or "")
            if not match_id:
                continue
            item = matches.setdefault(
                match_id,
                {
                    "match_id": match_id,
                    "home_team": row.get("home_team"),
                    "away_team": row.get("away_team"),
                    "kickoff_at": str(row.get("kickoff_at") or ""),
                    "stage": row.get("stage") or row.get("league_name") or "世界杯",
                    "match_num_str": row.get("match_num_str"),
                    "remark": row.get("remark"),
                    "official_odds_source": "中国竞彩网",
                    "team_context": {
                        "status": "等待球队最新资讯搜索；官方赔率仅用于玩法校验、赔率展示和风险提示。",
                    },
                    "odds": {},
                },
            )
            item["odds"][row_play_type] = {
                "odds": self._decode_json_object(row.get("odds_json")),
                "goal_line": row.get("goal_line"),
                "single_status": row.get("single_status"),
                "sell_status": row.get("odds_sell_status") or row.get("sell_status"),
                "fetched_at": str(row.get("odds_fetched_at") or ""),
            }
        return list(matches.values())

    def _enrich_match_context_with_news(self, match_context: list[dict[str, Any]]) -> list[dict[str, Any]]:
        try:
            return self.news_search_service.enrich_matches(match_context)
        except Exception as exc:
            self.logger.warning(
                "WorldCup news enrichment failed; continuing without news",
                extra={"context": {"error": str(exc)[:240]}},
            )
            for match in match_context:
                self._attach_unavailable_news(match, error=str(exc))
            return match_context

    def _normalize_ai_recommendations(
        self,
        payload: dict[str, Any],
        *,
        match_context: list[dict[str, Any]],
        model_code: str,
        model_name: str,
        overwrite: bool,
    ) -> list[dict[str, Any]]:
        rows = payload.get("recommendations")
        if not isinstance(rows, list):
            raise ValueError("模型返回的世界杯预测结构无效")
        context_by_match = {str(item.get("match_id") or ""): item for item in match_context}
        result: list[dict[str, Any]] = []
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            match_id = str(row.get("match_id") or "").strip()
            play_type = str(row.get("play_type") or "").strip()
            selection = str(row.get("selection") or "").strip()
            if match_id not in context_by_match or play_type not in WORLDCUP_PLAY_TYPES or not selection:
                continue
            odds_value = str(row.get("odds_value") or "").strip()
            model_sources = self._normalize_string_list(row.get("model_sources"))
            if not model_sources:
                model_sources = ["中国竞彩网赔率", "世界杯赛程"]
                if self._match_has_news(context_by_match[match_id]):
                    model_sources.append("球队最新资讯")
            result.append(
                {
                    "recommendation_id": f"wc-ai-{model_code}-{match_id}-{play_type}",
                    "match_id": match_id,
                    "play_type": play_type,
                    "selection": selection[:128],
                    "odds_value": odds_value,
                    "implied_probability": self._implied_probability(odds_value),
                    "confidence_level": self._normalize_level(row.get("confidence_level"), default="medium"),
                    "risk_level": self._normalize_level(row.get("risk_level"), default="medium"),
                    "budget_min": self._bounded_int(row.get("budget_min"), minimum=0, maximum=200, default=0),
                    "budget_max": self._bounded_int(row.get("budget_max"), minimum=0, maximum=300, default=30),
                    "reason": str(row.get("reason") or "基于当前可用赛程与球队资讯生成，赔率仅作展示参考。").strip(),
                    "input_summary": context_by_match[match_id],
                    "ai_payload": row,
                    "model_code": model_code,
                    "model_name": model_name,
                    "model_sources": model_sources,
                    "risk_tags": self._normalize_string_list(row.get("risk_tags")),
                    "status": "published",
                    "compliance_notice": WORLDCUP_COMPLIANCE_NOTICE,
                }
            )
        return result

    @staticmethod
    def _attach_unavailable_news(match: dict[str, Any], *, error: str) -> None:
        home_team = str(match.get("home_team") or "").strip()
        away_team = str(match.get("away_team") or "").strip()
        query = f"{home_team} {away_team} 世界杯 阵容 伤停 最新 team news".strip()
        team_context = match.setdefault("team_context", {})
        if not isinstance(team_context, dict):
            team_context = {}
            match["team_context"] = team_context
        team_context["status"] = "球队资讯搜索暂不可用；官方赔率仅用于玩法校验、赔率展示和风险提示。"
        team_context["news"] = {
            "status": "unavailable",
            "query": query,
            "provider": "none",
            "fetched_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            "results": [],
            "error": str(error)[:300],
        }

    @staticmethod
    def _match_has_news(match: dict[str, Any]) -> bool:
        team_context = match.get("team_context")
        if not isinstance(team_context, dict):
            return False
        news = team_context.get("news")
        return isinstance(news, dict) and str(news.get("status") or "") == "available" and bool(news.get("results"))

    @staticmethod
    def _decode_json_object(value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return value
        if not value:
            return {}
        try:
            parsed = json.loads(str(value))
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    @staticmethod
    def _normalize_level(value: Any, *, default: str) -> str:
        text = str(value or "").strip().lower()
        return text if text in {"low", "medium", "high"} else default

    @staticmethod
    def _bounded_int(value: Any, *, minimum: int, maximum: int, default: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return max(minimum, min(maximum, parsed))

    @staticmethod
    def _normalize_string_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    @staticmethod
    def _implied_probability(odds_value: str) -> float | None:
        try:
            odds = float(odds_value)
        except (TypeError, ValueError):
            return None
        if odds <= 0:
            return None
        return round(1 / odds, 6)
