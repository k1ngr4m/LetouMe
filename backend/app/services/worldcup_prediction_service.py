from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.repositories.model_repository import ModelRepository
from backend.app.repositories.worldcup_repository import WORLDCUP_COMPLIANCE_NOTICE, WorldCupRepository
from backend.core.model_config import load_model_registry
from backend.core.model_factory import ModelFactory


WORLDCUP_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "worldcup_prompt.md"
WORLDCUP_PLAY_TYPES = {"win_draw_win", "handicap_win_draw_win", "total_goals", "correct_score", "half_full_time"}


class WorldCupPredictionService:
    def __init__(
        self,
        repository: WorldCupRepository | None = None,
        model_repository: ModelRepository | None = None,
    ) -> None:
        self.repository = repository or WorldCupRepository()
        self.model_repository = model_repository or ModelRepository()
        self.logger = get_logger("services.worldcup_prediction")

    def generate_for_model(
        self,
        *,
        model_code: str,
        play_type: str = "all",
        overwrite: bool = False,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        ensure_schema()
        model_record = self._validate_model(model_code)
        model_def = load_model_registry().get(model_code)
        if not model_def.supports_lottery("worldcup"):
            raise ValueError("该模型未配置世界杯")
        rows = self.repository.list_recent_matches_with_odds(limit=200)
        match_context = self._build_match_context(rows, play_type=play_type)
        summary = {
            "lottery_code": "worldcup",
            "mode": "current",
            "model_code": model_code,
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
                        "status": "未接入第三方 API，当前仅使用赛程与官方赔率进行分析。",
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
                    "reason": str(row.get("reason") or "基于中国竞彩网官方赔率和当前可用赛程数据生成。").strip(),
                    "input_summary": context_by_match[match_id],
                    "ai_payload": row,
                    "model_code": model_code,
                    "model_name": model_name,
                    "model_sources": self._normalize_string_list(row.get("model_sources")) or ["中国竞彩网赔率", "世界杯赛程"],
                    "risk_tags": self._normalize_string_list(row.get("risk_tags")),
                    "status": "published",
                    "compliance_notice": WORLDCUP_COMPLIANCE_NOTICE,
                }
            )
        return result

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
