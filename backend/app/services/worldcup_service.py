from __future__ import annotations

import json
import re
from typing import Any

from backend.app.repositories.worldcup_repository import WORLDCUP_COMPLIANCE_NOTICE, WorldCupRepository
from backend.app.services.worldcup_baidu_sports_service import WorldCupBaiduSportsService, normalize_worldcup_team_name
from backend.app.time_utils import ensure_timestamp


PLAY_TYPE_LABELS = {
    "win_draw_win": "胜平负",
    "handicap_win_draw_win": "让球胜平负",
    "total_goals": "总进球数",
    "correct_score": "比分",
    "half_full_time": "半全场",
}
PLAY_TYPE_ORDER = tuple(PLAY_TYPE_LABELS.keys())


class WorldCupService:
    def __init__(
        self,
        repository: WorldCupRepository | None = None,
        baidu_sports_service: WorldCupBaiduSportsService | None = None,
    ) -> None:
        self.repository = repository or WorldCupRepository()
        self.baidu_sports_service = baidu_sports_service or WorldCupBaiduSportsService()

    def list_matches(self, payload: dict[str, Any]) -> dict[str, Any]:
        date_start = payload.get("date_start")
        date_end = payload.get("date_end")
        rows = self.repository.list_matches(
            date_start=date_start,
            date_end=date_end,
            team_query=self._clean_text(payload.get("team_query")),
            status_filter=str(payload.get("status_filter") or "all"),
        )
        rows = [row for row in rows if self._is_sporttery_match_row(row)]
        matches = [self._serialize_match(row) for row in self._dedupe_match_rows(rows)]
        return {"matches": matches, "total_count": len(matches)}

    def list_recommendations(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        rows = self.repository.list_recommendations(
            user_id=user_id,
            match_id=self._clean_text(payload.get("match_id")),
            date_start=payload.get("date_start"),
            date_end=payload.get("date_end"),
            play_type_filter=str(payload.get("play_type_filter") or "all"),
            risk_level_filter=str(payload.get("risk_level_filter") or "all"),
        )
        recommendations = [self._serialize_recommendation(row) for row in rows]
        return {
            "recommendations": recommendations,
            "total_count": len(recommendations),
            "compliance_notice": WORLDCUP_COMPLIANCE_NOTICE,
        }

    def get_recommendation(self, user_id: int, recommendation_id: str) -> dict[str, Any]:
        row = self.repository.get_recommendation(recommendation_id, user_id=user_id)
        if not row:
            raise KeyError(recommendation_id)
        return {"recommendation": self._serialize_recommendation(row)}

    def get_baidu_analysis(self, match_id: str) -> dict[str, Any]:
        row = self.repository.get_match(match_id)
        if not row:
            raise KeyError(match_id)
        encoded_match_id = self._extract_baidu_encoded_match_id(row.get("data_sources_json"))
        if not encoded_match_id:
            encoded_match_id = self.baidu_sports_service.find_encoded_match_id(
                home_team=str(row.get("home_team") or ""),
                away_team=str(row.get("away_team") or ""),
                kickoff_at=str(row.get("kickoff_at") or ""),
            )
        if not encoded_match_id:
            raise ValueError("暂无 Baidu 赛前分析来源，请先更新世界杯数据")
        return {
            "match_id": str(row.get("match_id") or ""),
            "match": self._serialize_match({**row, "recommendation_count": 0}),
            "analysis": self.baidu_sports_service.fetch_match_context(encoded_match_id),
        }

    def set_favorite(self, user_id: int, recommendation_id: str, favorite: bool) -> dict[str, Any]:
        row = self.repository.get_recommendation(recommendation_id, user_id=user_id)
        if not row:
            raise KeyError(recommendation_id)
        is_favorite = self.repository.set_favorite(user_id, recommendation_id, favorite)
        return {"recommendation_id": recommendation_id, "is_favorite": is_favorite}

    def build_simulation_draft(self, user_id: int, recommendation_id: str) -> dict[str, Any]:
        row = self.repository.get_recommendation(recommendation_id, user_id=user_id)
        if not row:
            raise KeyError(recommendation_id)
        ticket = self.create_simulation_from_recommendation(user_id, recommendation_id)["ticket"]
        play_label = PLAY_TYPE_LABELS.get(str(row.get("play_type")), str(row.get("play_type") or "玩法"))
        title = f"{row.get('home_team')} vs {row.get('away_team')} · {play_label}"
        checklist = "\n".join(
            [
                title,
                f"开赛时间：{row.get('kickoff_at')}",
                f"参考选项：{row.get('selection')}",
                f"建议预算：{int(row.get('budget_min') or 0)}-{int(row.get('budget_max') or 0)} 元",
                "提示：不保证中奖，仅供参考研究；请以线下实体店和官方公告为准。",
            ]
        )
        return {
            "recommendation_id": recommendation_id,
            "match_id": str(row.get("match_id") or ""),
            "title": title,
            "checklist": checklist,
            "amount": int(row.get("budget_max") or 0),
            "compliance_notice": WORLDCUP_COMPLIANCE_NOTICE,
            "ticket_id": ticket["id"],
        }

    def list_simulation_tickets(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        rows = self.repository.list_simulation_tickets(user_id, status_filter=str(payload.get("status_filter") or "all"))
        tickets = self._serialize_simulation_tickets(rows)
        return {"tickets": tickets, "total_count": len(tickets), "compliance_notice": WORLDCUP_COMPLIANCE_NOTICE}

    def create_simulation_ticket(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        normalized_payload = dict(payload)
        if not normalized_payload.get("items"):
            raise ValueError("至少需要一场比赛")
        normalized_payload["total_amount"] = int(normalized_payload.get("total_amount") or 0) or sum(int(item.get("amount") or 0) for item in normalized_payload["items"])
        ticket_id = self.repository.create_simulation_ticket(user_id, normalized_payload)
        ticket_rows = self.repository.get_simulation_ticket(user_id, ticket_id)
        tickets = self._serialize_simulation_tickets(ticket_rows)
        if not tickets:
            raise KeyError(str(ticket_id))
        return {"ticket": tickets[0]}

    def create_simulation_from_recommendation(self, user_id: int, recommendation_id: str, multiplier: int = 1) -> dict[str, Any]:
        row = self.repository.get_recommendation(recommendation_id, user_id=user_id)
        if not row:
            raise KeyError(recommendation_id)
        play_label = PLAY_TYPE_LABELS.get(str(row.get("play_type")), str(row.get("play_type") or "玩法"))
        amount = int(row.get("budget_max") or row.get("budget_min") or 0)
        payload = {
            "title": f"{row.get('home_team')} vs {row.get('away_team')} · {play_label}",
            "status": "draft",
            "total_amount": amount * max(1, int(multiplier or 1)),
            "multiplier": max(1, int(multiplier or 1)),
            "note": row.get("compliance_notice") or WORLDCUP_COMPLIANCE_NOTICE,
            "source_recommendation_id": recommendation_id,
            "items": [
                {
                    "match_id": str(row.get("match_id") or ""),
                    "recommendation_id": recommendation_id,
                    "play_type": str(row.get("play_type") or ""),
                    "selection": str(row.get("selection") or ""),
                    "odds_value": row.get("odds_value"),
                    "odds_snapshot": self._decode_json_object(row.get("latest_odds_json")),
                    "confidence_level": row.get("confidence_level"),
                    "amount": amount,
                }
            ],
        }
        return self.create_simulation_ticket(user_id, payload)

    def update_simulation_ticket(self, user_id: int, ticket_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        updates = {key: value for key, value in payload.items() if key != "ticket_id" and value is not None}
        if not self.repository.update_simulation_ticket(user_id, ticket_id, updates):
            raise KeyError(str(ticket_id))
        ticket_rows = self.repository.get_simulation_ticket(user_id, ticket_id)
        tickets = self._serialize_simulation_tickets(ticket_rows)
        if not tickets:
            raise KeyError(str(ticket_id))
        return {"ticket": tickets[0]}

    def delete_simulation_ticket(self, user_id: int, ticket_id: int) -> None:
        if not self.repository.delete_simulation_ticket(user_id, ticket_id):
            raise KeyError(str(ticket_id))

    def list_history(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        rows = self.repository.list_history_rows(
            user_id=user_id,
            date_start=payload.get("date_start"),
            date_end=payload.get("date_end"),
            status_filter=str(payload.get("status_filter") or "all"),
            play_type_filter=str(payload.get("play_type_filter") or "all"),
        )
        grouped: dict[str, dict[str, Any]] = {}
        for row in rows:
            match_id = str(row.get("match_id") or "")
            if match_id not in grouped:
                grouped[match_id] = {"match": self._serialize_match({**row, "recommendation_count": 0}), "recommendations": []}
            settlement = self._settle_recommendation(row)
            grouped[match_id]["recommendations"].append(
                {
                    "recommendation": self._serialize_recommendation(row),
                    **settlement,
                }
            )
        records = list(grouped.values())
        return {"records": records, "total_count": len(records), "compliance_notice": WORLDCUP_COMPLIANCE_NOTICE}

    def _serialize_recommendation(self, row: dict[str, Any]) -> dict[str, Any]:
        match = self._serialize_match(
            {
                "match_id": row.get("match_id"),
                "sporttery_match_id": row.get("sporttery_match_id"),
                "match_num_str": row.get("match_num_str"),
                "home_team": row.get("home_team"),
                "away_team": row.get("away_team"),
                "kickoff_at": row.get("kickoff_at"),
                "stage": row.get("stage"),
                "match_status": row.get("match_status"),
                "score": row.get("score"),
                "sell_status": row.get("sell_status"),
                        "odds_count": row.get("odds_count"),
                        "odds_fetched_at": row.get("odds_fetched_at"),
                "recommendation_count": 0,
            }
        )
        return {
            "recommendation_id": str(row.get("recommendation_id") or ""),
            "match": match,
            "play_type": str(row.get("play_type") or ""),
            "selection": str(row.get("selection") or ""),
            "odds_value": str(row.get("odds_value") or "") or None,
            "implied_probability": float(row["implied_probability"]) if row.get("implied_probability") is not None else None,
            "confidence_score": float(row["confidence_score"]) if row.get("confidence_score") is not None else None,
            "confidence_level": str(row.get("confidence_level") or "medium"),
            "risk_level": str(row.get("risk_level") or "medium"),
            "budget_min": int(row.get("budget_min") or 0),
            "budget_max": int(row.get("budget_max") or 0),
            "reason": str(row.get("reason") or ""),
            "latest_odds": self._normalize_odds_labels(str(row.get("play_type") or ""), self._decode_json_object(row.get("latest_odds_json"))),
            "odds_fetched_at": int(ensure_timestamp(row.get("odds_fetched_at"), assume_beijing=True) or 0) or None,
            "model_sources": self._decode_json_list(row.get("model_sources_json")),
            "risk_tags": self._decode_json_list(row.get("risk_tags_json")),
            "is_favorite": bool(int(row.get("is_favorite") or 0)),
            "compliance_notice": str(row.get("compliance_notice") or WORLDCUP_COMPLIANCE_NOTICE),
            "updated_at": int(ensure_timestamp(row.get("updated_at"), assume_beijing=True) or 0),
            "created_at": int(ensure_timestamp(row.get("created_at"), assume_beijing=True) or 0),
        }

    def _serialize_simulation_tickets(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        grouped: dict[int, dict[str, Any]] = {}
        for row in rows:
            ticket_id = int(row.get("ticket_id") or 0)
            if ticket_id <= 0:
                continue
            if ticket_id not in grouped:
                grouped[ticket_id] = {
                    "id": ticket_id,
                    "title": str(row.get("title") or "世界杯模拟方案"),
                    "status": str(row.get("status") or "draft"),
                    "total_amount": int(row.get("total_amount") or 0),
                    "multiplier": int(row.get("multiplier") or 1),
                    "note": str(row.get("note") or "") or None,
                    "source_recommendation_id": str(row.get("source_recommendation_id") or "") or None,
                    "items": [],
                    "created_at": int(ensure_timestamp(row.get("ticket_created_at"), assume_beijing=True) or 0),
                    "updated_at": int(ensure_timestamp(row.get("ticket_updated_at"), assume_beijing=True) or 0),
                    "compliance_notice": WORLDCUP_COMPLIANCE_NOTICE,
                }
            grouped[ticket_id]["items"].append(
                {
                    "id": int(row.get("item_id") or 0),
                    "match": self._serialize_match(row),
                    "recommendation_id": str(row.get("recommendation_id") or "") or None,
                    "play_type": str(row.get("play_type") or ""),
                    "selection": str(row.get("selection") or ""),
                    "odds_value": str(row.get("odds_value") or "") or None,
                    "odds_snapshot": self._decode_json_object(row.get("odds_snapshot_json")),
                    "confidence_level": str(row.get("confidence_level") or "") or None,
                    "amount": int(row.get("item_amount") or 0),
                }
            )
        return list(grouped.values())

    @classmethod
    def _dedupe_match_rows(cls, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        grouped: dict[tuple[str, str, str], dict[str, Any]] = {}
        order: list[tuple[str, str, str]] = []
        for row in rows:
            signature = cls._match_signature(row)
            if not all(signature):
                signature = (str(row.get("match_id") or ""), "", "")
            if signature not in grouped:
                grouped[signature] = dict(row)
                order.append(signature)
                continue
            grouped[signature] = cls._merge_duplicate_match_rows(grouped[signature], row)
        return [grouped[signature] for signature in order]

    @classmethod
    def _is_sporttery_match_row(cls, row: dict[str, Any]) -> bool:
        if row.get("sporttery_match_id") or row.get("match_num_str") or str(row.get("match_id") or "").startswith("sporttery-"):
            return True
        data_sources = row.get("data_sources_json")
        if isinstance(data_sources, str):
            try:
                data_sources = json.loads(data_sources)
            except json.JSONDecodeError:
                data_sources = None
        if isinstance(data_sources, list):
            return "sporttery" in {str(item) for item in data_sources}
        if isinstance(data_sources, dict):
            return "sporttery" in {str(item) for item in data_sources.get("sources") or []}
        return False

    @staticmethod
    def _match_signature(row: dict[str, Any]) -> tuple[str, str, str]:
        return (
            str(row.get("kickoff_at") or "")[:16],
            normalize_worldcup_team_name(row.get("home_team")),
            normalize_worldcup_team_name(row.get("away_team")),
        )

    @classmethod
    def _merge_duplicate_match_rows(cls, left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
        primary, secondary = (left, right) if cls._match_row_rank(left) >= cls._match_row_rank(right) else (right, left)
        merged = dict(primary)
        for key, value in secondary.items():
            if key == "odds_snapshots":
                continue
            if key == "recommendation_count":
                merged[key] = max(int(merged.get(key) or 0), int(value or 0))
                continue
            if key == "source_updated_at":
                merged[key] = max(str(merged.get(key) or ""), str(value or "")) or None
                continue
            if key == "match_status" and value in {"live", "finished"}:
                merged[key] = value
                continue
            if key == "score" and value:
                merged[key] = value
                continue
            if not merged.get(key) and value:
                merged[key] = value
        merged["odds_snapshots"] = cls._merge_odds_snapshots(primary.get("odds_snapshots"), secondary.get("odds_snapshots"))
        return merged

    @classmethod
    def _match_row_rank(cls, row: dict[str, Any]) -> tuple[int, int, int, int, int, str]:
        status_rank = {"finished": 2, "live": 1}.get(str(row.get("match_status") or ""), 0)
        return (
            int(row.get("odds_count") or len(row.get("odds_snapshots") or []) or 0),
            1 if row.get("sporttery_match_id") else 0,
            1 if row.get("match_num_str") else 0,
            int(row.get("recommendation_count") or 0),
            status_rank,
            str(row.get("source_updated_at") or ""),
        )

    @classmethod
    def _merge_odds_snapshots(cls, left: Any, right: Any) -> list[dict[str, Any]]:
        snapshots_by_type: dict[str, dict[str, Any]] = {}
        for snapshot in [*(left or []), *(right or [])]:
            if not isinstance(snapshot, dict):
                continue
            play_type = str(snapshot.get("play_type") or "")
            if not play_type:
                continue
            existing = snapshots_by_type.get(play_type)
            if existing is None or cls._odds_snapshot_rank(snapshot) >= cls._odds_snapshot_rank(existing):
                snapshots_by_type[play_type] = snapshot
        return list(snapshots_by_type.values())

    @staticmethod
    def _odds_snapshot_rank(snapshot: dict[str, Any]) -> tuple[int, str]:
        odds = WorldCupService._decode_json_object(snapshot.get("odds_json"))
        displayable_count = sum(1 for value in odds.values() if WorldCupService._is_displayable_odds_value(value))
        return displayable_count, str(snapshot.get("odds_fetched_at") or snapshot.get("fetched_at") or "")

    def _settle_recommendation(self, row: dict[str, Any]) -> dict[str, Any]:
        score = self._parse_score(row.get("score"))
        if str(row.get("match_status") or "") != "finished" or score is None:
            return {
                "result_status": "pending",
                "hit": None,
                "actual_result": None,
                "settlement_note": "比赛尚未完赛或比分未同步，暂不结算。",
            }
        play_type = str(row.get("play_type") or "")
        selection = str(row.get("selection") or "")
        actual_result, hit = self._calculate_hit(play_type, selection, score, row)
        if hit is None:
            return {
                "result_status": "unknown",
                "hit": None,
                "actual_result": actual_result,
                "settlement_note": "缺少让球、半场比分或标准选项，暂无法自动判断。",
            }
        return {
            "result_status": "settled",
            "hit": hit,
            "actual_result": actual_result,
            "settlement_note": "已按当前比分和推荐文本自动判断，仅供复盘参考。",
        }

    def _calculate_hit(self, play_type: str, selection: str, score: tuple[int, int], row: dict[str, Any]) -> tuple[str, bool | None]:
        home_score, away_score = score
        normalized_selection = selection.replace("：", ":").replace("／", "/")
        if play_type == "win_draw_win":
            actual = self._wdw_label(home_score - away_score)
            return actual, self._selection_matches_outcome(normalized_selection, actual, allow_unbeaten=True)
        if play_type == "handicap_win_draw_win":
            goal_line = self._parse_goal_line(row.get("odds_goal_line"))
            if goal_line is None:
                return "让球赛果未知", None
            actual = self._wdw_label(home_score + goal_line - away_score)
            return f"让球{goal_line:g}后{actual}", self._selection_matches_outcome(normalized_selection, actual, allow_unbeaten=False)
        if play_type == "total_goals":
            total_goals = home_score + away_score
            return f"{total_goals}球", self._selection_matches_total_goals(normalized_selection, total_goals)
        if play_type == "correct_score":
            actual = f"{home_score}:{away_score}"
            return actual, actual in normalized_selection or f"{home_score}-{away_score}" in normalized_selection
        if play_type == "half_full_time":
            return "半全场结果未知", None
        return "赛果未知", None

    @staticmethod
    def _parse_score(value: Any) -> tuple[int, int] | None:
        if not value:
            return None
        match = re.search(r"(\d+)\s*[:：-]\s*(\d+)", str(value))
        if not match:
            return None
        return int(match.group(1)), int(match.group(2))

    @staticmethod
    def _parse_goal_line(value: Any) -> float | None:
        if value is None or value == "":
            return None
        match = re.search(r"[-+]?\d+(?:\.\d+)?", str(value))
        return float(match.group(0)) if match else None

    @staticmethod
    def _wdw_label(diff: float) -> str:
        if diff > 0:
            return "胜"
        if diff < 0:
            return "负"
        return "平"

    @staticmethod
    def _selection_matches_outcome(selection: str, actual: str, *, allow_unbeaten: bool) -> bool | None:
        if allow_unbeaten and "不败" in selection:
            return actual in {"胜", "平"}
        tokens: set[str] = set()
        if "胜" in selection or "主胜" in selection:
            tokens.add("胜")
        if "平" in selection:
            tokens.add("平")
        if "负" in selection or "客胜" in selection:
            tokens.add("负")
        if not tokens:
            return None
        return actual in tokens

    @staticmethod
    def _selection_matches_total_goals(selection: str, total_goals: int) -> bool | None:
        ranges = re.findall(r"(\d+)\s*[-~至到]\s*(\d+)", selection)
        if ranges:
            return any(int(start) <= total_goals <= int(end) for start, end in ranges)
        numbers = [int(value) for value in re.findall(r"\d+", selection)]
        if numbers:
            return total_goals in numbers
        return None

    @staticmethod
    def _serialize_match(row: dict[str, Any]) -> dict[str, Any]:
        odds_snapshots = [
            WorldCupService._serialize_odds_snapshot(snapshot)
            for snapshot in (row.get("odds_snapshots") or [])
            if isinstance(snapshot, dict)
        ]
        odds_snapshots.sort(key=lambda item: PLAY_TYPE_ORDER.index(item["play_type"]) if item["play_type"] in PLAY_TYPE_ORDER else len(PLAY_TYPE_ORDER))
        latest_odds = WorldCupService._normalize_odds_labels(str(row.get("play_type") or ""), WorldCupService._decode_json_object(row.get("latest_odds_json")))
        if not latest_odds:
            latest_odds = next((snapshot["odds"] for snapshot in odds_snapshots if snapshot["odds"]), {})
        odds_fetched_at = int(ensure_timestamp(row.get("odds_fetched_at"), assume_beijing=True) or 0) or None
        if odds_fetched_at is None:
            fetched_values = [int(snapshot["fetched_at"] or 0) for snapshot in odds_snapshots if snapshot.get("fetched_at")]
            odds_fetched_at = max(fetched_values) if fetched_values else None
        return {
            "match_id": str(row.get("match_id") or ""),
            "sporttery_match_id": str(row.get("sporttery_match_id") or "") or None,
            "match_num_str": str(row.get("match_num_str") or "") or None,
            "home_team": str(row.get("home_team") or ""),
            "away_team": str(row.get("away_team") or ""),
            "kickoff_at": int(ensure_timestamp(row.get("kickoff_at"), assume_beijing=True) or 0),
            "stage": str(row.get("stage") or ""),
            "status": str(row.get("match_status") or row.get("status") or "scheduled"),
            "score": row.get("score"),
            "sell_status": str(row.get("sell_status") or "") or None,
            "latest_odds": latest_odds,
            "odds_snapshots": odds_snapshots,
            "odds_fetched_at": odds_fetched_at,
            "recommendation_count": int(row.get("recommendation_count") or 0),
        }

    @staticmethod
    def _serialize_odds_snapshot(row: dict[str, Any]) -> dict[str, Any]:
        play_type = str(row.get("play_type") or "")
        return {
            "play_type": play_type,
            "play_label": PLAY_TYPE_LABELS.get(play_type, play_type or "玩法"),
            "odds": WorldCupService._normalize_odds_labels(play_type, WorldCupService._decode_json_object(row.get("odds_json"))),
            "goal_line": str(row.get("goal_line") or "") or None,
            "single_status": str(row.get("single_status") or "") or None,
            "sell_status": str(row.get("odds_sell_status") or row.get("sell_status") or "") or None,
            "source": str(row.get("source") or "") or None,
            "source_updated_at": int(ensure_timestamp(row.get("source_updated_at"), assume_beijing=True) or 0) or None,
            "fetched_at": int(ensure_timestamp(row.get("odds_fetched_at") or row.get("fetched_at"), assume_beijing=True) or 0) or None,
        }

    @staticmethod
    def _normalize_odds_labels(play_type: str, odds: dict[str, str]) -> dict[str, str]:
        normalized: dict[str, str] = {}
        for key, value in odds.items():
            clean_value = str(value or "").strip()
            if not WorldCupService._is_displayable_odds_value(clean_value):
                continue
            if play_type == "correct_score" and str(key).strip().lower().endswith("f"):
                continue
            normalized[WorldCupService._format_odds_label(play_type, str(key))] = clean_value
        return normalized

    @staticmethod
    def _format_odds_label(play_type: str, key: str) -> str:
        text = key.strip().lower()
        if play_type == "total_goals" and text == "7":
            return "7+"
        if play_type != "correct_score":
            return key
        if text == "s90":
            return "胜其它"
        if text == "s99":
            return "平其它"
        if text == "s09":
            return "负其它"
        other_label = {
            "s1sh": "胜其它",
            "s1sd": "平其它",
            "s1sa": "负其它",
        }.get(text)
        if other_label:
            return other_label
        combined_match = re.fullmatch(r"s(\d{2})s(\d{2})", text)
        if combined_match:
            return f"{int(combined_match.group(1))}:{int(combined_match.group(2))}"
        match = re.fullmatch(r"s(\d)(\d)", text)
        if not match:
            return key
        home_score, away_score = match.group(1), match.group(2)
        if home_score == "9" and away_score == "0":
            return "胜其它"
        if home_score == "9" and away_score == "9":
            return "平其它"
        if home_score == "0" and away_score == "9":
            return "负其它"
        return f"{int(home_score)}:{int(away_score)}"

    @staticmethod
    def _is_displayable_odds_value(value: Any) -> bool:
        text = str(value or "").strip()
        if not text:
            return False
        try:
            return float(text) > 0
        except ValueError:
            return True

    @staticmethod
    def _decode_json_list(value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item) for item in value]
        if not value:
            return []
        try:
            loaded = json.loads(str(value))
        except json.JSONDecodeError:
            return []
        if not isinstance(loaded, list):
            return []
        return [str(item) for item in loaded]

    @staticmethod
    def _decode_json_object(value: Any) -> dict[str, str]:
        if isinstance(value, dict):
            return {str(key): str(item) for key, item in value.items()}
        if not value:
            return {}
        try:
            loaded = json.loads(str(value))
        except json.JSONDecodeError:
            return {}
        if not isinstance(loaded, dict):
            return {}
        return {str(key): str(item) for key, item in loaded.items()}

    @staticmethod
    def _decode_json_dict(value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return value
        if not value:
            return {}
        try:
            loaded = json.loads(str(value))
        except json.JSONDecodeError:
            return {}
        return loaded if isinstance(loaded, dict) else {}

    @classmethod
    def _extract_baidu_encoded_match_id(cls, value: Any) -> str:
        data_sources = cls._decode_json_dict(value)
        baidu_source = data_sources.get("baidu_tiyu")
        if not isinstance(baidu_source, dict):
            return ""
        return str(baidu_source.get("encoded_match_id") or "").strip()

    @staticmethod
    def _clean_text(value: Any) -> str | None:
        text = str(value or "").strip()
        return text or None
