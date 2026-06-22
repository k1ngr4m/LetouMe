from __future__ import annotations

from datetime import datetime
import hashlib
import json
import re
from typing import Any

import requests

from backend.app.logging_utils import get_logger
from backend.app.time_utils import beijing_now, format_beijing_datetime


BAIDU_SCHEDULE_URL = "https://tiyu.baidu.com/al/api/match/schedules"
BAIDU_DETAIL_URL = "https://tiyu.baidu.com/al/live/detail"
BAIDU_INCIDENTS_URL = "https://tiyu.baidu.com/al/api/liveDetail/liveTextBroadcastAndIncident"
BAIDU_ODDS_NOTE = "Baidu/第三方指数仅作赛前分析参考；官方投注赔率仍以中国竞彩网为准。"


class WorldCupBaiduSportsService:
    def __init__(self, *, timeout: int = 15, max_context_matches: int = 24) -> None:
        self.timeout = max(1, int(timeout or 15))
        self.max_context_matches = max(1, int(max_context_matches or 24))
        self.logger = get_logger("services.worldcup_baidu_sports")

    def fetch_schedule_matches(self, *, start_date: str | None = None, direction: str = "after") -> list[dict[str, Any]]:
        payload = self._fetch_json(
            BAIDU_SCHEDULE_URL,
            params={
                "from": "self",
                "match": "世界杯",
                "date": start_date or beijing_now().strftime("%Y-%m-%d"),
                "direction": direction,
                "isAsync": "1",
            },
            referer="https://tiyu.baidu.com/al/match?match=%E4%B8%96%E7%95%8C%E6%9D%AF&tab=%E8%B5%9B%E7%A8%8B&from=baidu_aladdin",
        )
        return self.parse_schedule_matches(payload)

    def parse_schedule_matches(self, payload: dict[str, Any], *, fetched_at: str | None = None) -> list[dict[str, Any]]:
        fetched_at = fetched_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        rows: list[dict[str, Any]] = []
        for day in payload.get("data") or []:
            if not isinstance(day, dict):
                continue
            for match in day.get("list") or []:
                if not isinstance(match, dict):
                    continue
                home_team = self._team_name(match.get("leftLogo"))
                away_team = self._team_name(match.get("rightLogo"))
                kickoff_at = str(match.get("startTime") or "").strip()
                if not home_team or not away_team or not kickoff_at:
                    continue
                baidu_match_id = str(match.get("id") or "").strip()
                encoded_match_id = str(match.get("matchId") or match.get("key") or "").strip()
                rows.append(
                    {
                        "match_id": self._local_match_id(baidu_match_id, encoded_match_id),
                        "sporttery_match_id": "",
                        "match_num": "",
                        "match_num_str": "",
                        "match_num_date": str(day.get("time") or match.get("date") or "")[:10],
                        "tax_date_no": "",
                        "home_team": home_team,
                        "away_team": away_team,
                        "kickoff_at": kickoff_at,
                        "stage": str(match.get("matchStage") or match.get("matchName") or "世界杯").strip(),
                        "league_name": str(match.get("game") or "世界杯").strip(),
                        "business_date": str(day.get("time") or "")[:10],
                        "sell_status": str(match.get("matchStatusText") or match.get("statusText") or match.get("status") or ""),
                        "match_status": self._normalize_match_status(match),
                        "score": self._score(match),
                        "remark": str(match.get("oriKey") or match.get("matchName") or ""),
                        "data_sources": self._baidu_data_source(match, baidu_match_id=baidu_match_id, encoded_match_id=encoded_match_id),
                        "source_updated_at": fetched_at,
                    }
                )
        return rows

    def enrich_matches(self, match_context: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for index, match in enumerate(match_context):
            if index >= self.max_context_matches:
                self._attach_skipped_context(match)
                continue
            encoded_match_id = self._encoded_match_id_from_context(match)
            if not encoded_match_id:
                self._attach_unavailable_context(match, error="Baidu matchId is not available for this match")
                continue
            try:
                match["team_context"]["baidu_sports"] = self.fetch_match_context(encoded_match_id)
            except Exception as exc:
                self.logger.warning(
                    "Baidu sports match context unavailable",
                    extra={"context": {"match_id": match.get("match_id"), "error": str(exc)[:240]}},
                )
                self._attach_unavailable_context(match, error=str(exc))
        return match_context

    def fetch_match_context(self, encoded_match_id: str) -> dict[str, Any]:
        analysis = self._fetch_detail_tab(encoded_match_id, "分析")
        lineup = self._fetch_detail_tab(encoded_match_id, "阵容")
        index = self._fetch_detail_tab(encoded_match_id, "指数")
        return self.parse_match_context(analysis_payload=analysis, lineup_payload=lineup, index_payload=index)

    def fetch_half_time_score(self, encoded_match_id: str) -> str | None:
        payload = self._fetch_json(
            BAIDU_INCIDENTS_URL,
            params={
                "matchKey": encoded_match_id,
                "ofType": "incidents",
            },
            referer=f"https://tiyu.baidu.com/al/live/detail?matchId={encoded_match_id}&tab=%E8%B5%9B%E5%86%B5",
        )
        return self.parse_half_time_score(payload)

    def find_encoded_match_id(self, *, home_team: str, away_team: str, kickoff_at: str) -> str:
        date_key = str(kickoff_at or "")[:10]
        if not date_key:
            return ""
        target_signature = (
            str(kickoff_at or "")[:16],
            normalize_worldcup_team_name(home_team),
            normalize_worldcup_team_name(away_team),
        )
        for match in self.fetch_schedule_matches(start_date=date_key):
            signature = (
                str(match.get("kickoff_at") or "")[:16],
                normalize_worldcup_team_name(match.get("home_team")),
                normalize_worldcup_team_name(match.get("away_team")),
            )
            if signature != target_signature:
                continue
            data_sources = match.get("data_sources")
            if isinstance(data_sources, dict):
                baidu = data_sources.get("baidu_tiyu")
                if isinstance(baidu, dict):
                    return str(baidu.get("encoded_match_id") or "").strip()
        return ""

    def parse_match_context(
        self,
        *,
        analysis_payload: dict[str, Any] | None = None,
        lineup_payload: dict[str, Any] | None = None,
        index_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        analysis_data = self._first_tab_data(analysis_payload or {})
        lineup_data = self._first_tab_data(lineup_payload or {})
        index_data = self._first_tab_data(index_payload or {})
        context = {
            "status": "available",
            "provider": "baidu_tiyu",
            "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "recent_records": self._parse_recent_records(analysis_data.get("homeRecord")),
            "pre_match_prediction": self._parse_pre_match_prediction(analysis_data.get("result")),
            "positive_intelligence": self._parse_intelligence(analysis_data.get("igence"), title="有利情报"),
            "negative_intelligence": self._parse_intelligence(analysis_data.get("igence"), title="不利情报"),
            "squad_status": self._parse_squad_status(lineup_data),
            "index_reference": self._parse_index_reference(index_data),
        }
        if not any(context[key] for key in ("recent_records", "pre_match_prediction", "positive_intelligence", "negative_intelligence", "squad_status", "index_reference")):
            context["status"] = "unavailable"
            context["error"] = "Baidu sports context payload is empty"
        return context

    def _fetch_detail_tab(self, encoded_match_id: str, tab: str) -> dict[str, Any]:
        return self._fetch_json(
            BAIDU_DETAIL_URL,
            params={
                "matchId": encoded_match_id,
                "tab": tab,
                "async_source": "h5",
                "tab_type": "single",
                "from": "baidu_shoubai_na",
                "request__node__params": "1",
                "getAll": "1",
            },
            referer="https://tiyu.baidu.com/al/match?match=%E4%B8%96%E7%95%8C%E6%9D%AF&tab=%E8%B5%9B%E7%A8%8B&from=baidu_aladdin",
        )

    def _fetch_json(self, url: str, *, params: dict[str, str], referer: str) -> dict[str, Any]:
        response = requests.get(url, params=params, timeout=self.timeout, headers=self._headers(referer))
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Baidu sports response is not a JSON object")
        status = str(payload.get("status", payload.get("errno", "0")))
        if status not in {"0", ""}:
            raise ValueError(str(payload.get("message") or payload.get("msg") or "Baidu sports returned an error"))
        return payload

    @staticmethod
    def _headers(referer: str) -> dict[str, str]:
        return {
            "Accept": "application/json,text/plain,*/*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": referer,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149 Safari/537.36",
        }

    @staticmethod
    def _first_tab_data(payload: dict[str, Any]) -> dict[str, Any]:
        data = payload.get("tplData", {}).get("data", {}) if isinstance(payload, dict) else {}
        tabs = data.get("tabsList") if isinstance(data, dict) else None
        if not isinstance(tabs, list) or not tabs or not isinstance(tabs[0], dict):
            return {}
        tab_data = tabs[0].get("data")
        return tab_data if isinstance(tab_data, dict) else {}

    @staticmethod
    def _team_name(value: Any) -> str:
        return str(value.get("name") or "").strip() if isinstance(value, dict) else ""

    @staticmethod
    def _local_match_id(baidu_match_id: str, encoded_match_id: str) -> str:
        if baidu_match_id:
            return f"baidu-{baidu_match_id[:48]}"
        digest = hashlib.sha1(encoded_match_id.encode("utf-8")).hexdigest()[:24] if encoded_match_id else "unknown"
        return f"baidu-{digest}"

    @staticmethod
    def _baidu_data_source(match: dict[str, Any], *, baidu_match_id: str, encoded_match_id: str) -> dict[str, Any]:
        return {
            "sources": ["baidu_tiyu"],
            "baidu_tiyu": {
                "match_id": baidu_match_id or None,
                "encoded_match_id": encoded_match_id or None,
                "ori_key": str(match.get("oriKey") or "") or None,
                "detail_path": str(match.get("link") or "") or None,
                "analysis_url": f"https://tiyu.baidu.com{match.get('link')}" if str(match.get("link") or "").startswith("/") else str(match.get("link") or "") or None,
            },
        }

    @staticmethod
    def _normalize_match_status(match: dict[str, Any]) -> str:
        status = str(match.get("status") or "").strip()
        text = str(match.get("matchStatusText") or match.get("statusText") or "").strip().lower()
        if status in {"2", "3"} or "完" in text or "结束" in text:
            return "finished"
        if status in {"1"} or "直播" in text or "进行" in text:
            return "live"
        return "scheduled"

    @classmethod
    def _score(cls, match: dict[str, Any]) -> str | None:
        if cls._normalize_match_status(match) == "scheduled":
            return None
        score_info = match.get("scoreInfo") if isinstance(match.get("scoreInfo"), dict) else {}
        left_score = str(score_info.get("leftRegularScore") or (match.get("leftLogo") or {}).get("score") or "").strip()
        right_score = str(score_info.get("rightRegularScore") or (match.get("rightLogo") or {}).get("score") or "").strip()
        if left_score in {"", "-"} or right_score in {"", "-"}:
            return None
        return f"{left_score}:{right_score}"

    @classmethod
    def parse_half_time_score(cls, payload: dict[str, Any]) -> str | None:
        incidents = cls._incident_rows(payload)
        if not incidents:
            return None
        home_score = 0
        away_score = 0
        for incident in incidents:
            if not cls._is_first_half_incident(incident):
                continue
            if not cls._is_scoring_incident(incident):
                continue
            score_side = cls._incident_score_side(incident)
            if score_side == "left":
                home_score += 1
            elif score_side == "right":
                away_score += 1
            else:
                return None
        return f"{home_score}:{away_score}"

    @staticmethod
    def _incident_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
        data = payload.get("data") if isinstance(payload, dict) else {}
        graphic_incidents = data.get("graphic_incidents") if isinstance(data, dict) else {}
        incidents = graphic_incidents.get("incidents") if isinstance(graphic_incidents, dict) else None
        if not isinstance(incidents, list):
            return []
        return [incident for incident in incidents if isinstance(incident, dict)]

    @classmethod
    def _is_first_half_incident(cls, incident: dict[str, Any]) -> bool:
        minute = cls._incident_minute(incident)
        if minute is None:
            return False
        return minute <= 45

    @staticmethod
    def _incident_minute(incident: dict[str, Any]) -> int | None:
        passed_time = str(incident.get("passedTime") or "").strip()
        match = re.search(r"(\d+)(?:\s*\+\s*\d+)?", passed_time)
        if match:
            return int(match.group(1))
        sort_time = incident.get("sortTime")
        try:
            seconds = int(sort_time)
        except (TypeError, ValueError):
            return None
        if seconds <= 0:
            return None
        return seconds // 60

    @staticmethod
    def _is_scoring_incident(incident: dict[str, Any]) -> bool:
        goal_type = str(incident.get("goaltype") or "").strip()
        incident_type = str(incident.get("type") or "").strip()
        text = str(incident.get("text") or "").strip()
        combined = f"{incident_type} {goal_type} {text}"
        if any(keyword in combined for keyword in ("无效", "取消", "未进", "射失", "扑出")):
            return False
        return goal_type in {"进球", "点球", "乌龙球"} or incident_type in {"进球", "点球", "乌龙球"}

    @staticmethod
    def _incident_score_side(incident: dict[str, Any]) -> str | None:
        left = incident.get("left")
        right = incident.get("right")
        has_left = isinstance(left, dict)
        has_right = isinstance(right, dict)
        if has_left == has_right:
            return None
        return "left" if has_left else "right"

    @staticmethod
    def _parse_recent_records(value: Any) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        for item in value or []:
            if not isinstance(item, dict):
                continue
            for scope in ("history", "home"):
                block = item.get(scope)
                if not isinstance(block, dict):
                    continue
                records.append(
                    {
                        "scope": "all" if scope == "history" else "same_home_away",
                        "team_name": str(block.get("team_name") or "").strip(),
                        "title": str(block.get("title") or "").strip(),
                        "result": str(block.get("result") or "").strip(),
                        "probability": [str(entry.get("title") or "") for entry in block.get("probability") or [] if isinstance(entry, dict) and entry.get("title")],
                        "matches": WorldCupBaiduSportsService._parse_record_matches(block.get("list")),
                    }
                )
        return records

    @staticmethod
    def _parse_record_matches(value: Any) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for item in value or []:
            if not isinstance(item, dict):
                continue
            left = item.get("left") if isinstance(item.get("left"), dict) else {}
            right = item.get("right") if isinstance(item.get("right"), dict) else {}
            rows.append(
                {
                    "date": str(item.get("date") or ""),
                    "match": str(item.get("match") or ""),
                    "score": f"{left.get('name')} {left.get('score')} - {right.get('score')} {right.get('name')}",
                    "handicap": item.get("oddsHandicap") if isinstance(item.get("oddsHandicap"), dict) else None,
                    "total_goals": item.get("oddsTotalGoals") if isinstance(item.get("oddsTotalGoals"), dict) else None,
                }
            )
        return rows[:6]

    @staticmethod
    def _parse_pre_match_prediction(value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            return {}
        return {
            "sample_count": str(value.get("num") or ""),
            "percentage": value.get("percentage") if isinstance(value.get("percentage"), dict) else {},
            "teams": value.get("team") if isinstance(value.get("team"), list) else [],
            "source_label": str(value.get("resultfont") or "赛前预测"),
        }

    @staticmethod
    def _parse_intelligence(value: Any, *, title: str) -> list[dict[str, Any]]:
        for block in value or []:
            if not isinstance(block, dict) or str(block.get("intelligencetitle") or "") != title:
                continue
            intelligence = block.get("intelligence") if isinstance(block.get("intelligence"), dict) else {}
            return [
                WorldCupBaiduSportsService._parse_team_intelligence(intelligence, "intelligenceTeamInfo", "intelligenceteam"),
                WorldCupBaiduSportsService._parse_team_intelligence(intelligence, "intelligenceteamLeaterInfo", "intelligenceteamleater"),
            ]
        return []

    @staticmethod
    def _parse_team_intelligence(intelligence: dict[str, Any], info_key: str, list_key: str) -> dict[str, Any]:
        info = intelligence.get(info_key) if isinstance(intelligence.get(info_key), dict) else {}
        return {
            "team_name": str(info.get("name") or ""),
            "items": [str(item.get("content") or "") for item in intelligence.get(list_key) or [] if isinstance(item, dict) and item.get("content")],
        }

    @staticmethod
    def _parse_squad_status(value: dict[str, Any]) -> dict[str, Any]:
        if not value:
            return {}
        home = WorldCupBaiduSportsService._parse_lineup_team(value.get("home"))
        away = WorldCupBaiduSportsService._parse_lineup_team(value.get("away"))
        has_starters = bool((value.get("home") or {}).get("starter") or (value.get("away") or {}).get("starter")) if isinstance(value.get("home"), dict) and isinstance(value.get("away"), dict) else False
        update_time = format_beijing_datetime(value.get("update_time"), with_seconds=True) if value.get("update_time") else None
        return {
            "status": "首发阵容已确认" if has_starters else "阵容名单已获取，首发待确认",
            "confirmed": bool(value.get("confirmed")),
            "court": str(value.get("court") or "") or None,
            "referee": str(value.get("referee") or "") or None,
            "updated_at": update_time,
            "home": home,
            "away": away,
        }

    @staticmethod
    def _parse_lineup_team(value: Any) -> dict[str, Any]:
        team = value if isinstance(value, dict) else {}
        return {
            "name": str(team.get("name") or ""),
            "formation": str(team.get("formation") or "") or None,
            "manager": team.get("manager") if isinstance(team.get("manager"), dict) else None,
            "players": [
                {
                    "player_id": str(player.get("playerId") or ""),
                    "name": str(player.get("name") or ""),
                    "position": str(player.get("position") or ""),
                    "age": str(player.get("age") or "") or None,
                }
                for player in (team.get("playerList") or [])[:26]
                if isinstance(player, dict)
            ],
        }

    @staticmethod
    def _parse_index_reference(value: dict[str, Any]) -> dict[str, Any]:
        items: list[dict[str, Any]] = []
        tabs = value.get("tabs") if isinstance(value.get("tabs"), list) else []
        for index, block in enumerate(value.get("list") or []):
            if not isinstance(block, dict):
                continue
            items.append(
                {
                    "type": str(block.get("type") or (tabs[index] if index < len(tabs) else "")),
                    "samples": [
                        {
                            "initial": row.get("initial"),
                            "now": row.get("now"),
                        }
                        for row in (block.get("datas") or [])[:5]
                        if isinstance(row, dict)
                    ],
                }
            )
        return {"note": BAIDU_ODDS_NOTE, "items": items} if items else {}

    @staticmethod
    def _encoded_match_id_from_context(match: dict[str, Any]) -> str:
        data_sources = match.get("data_sources")
        if isinstance(data_sources, str):
            try:
                data_sources = json.loads(data_sources)
            except Exception:
                data_sources = {}
        if isinstance(data_sources, dict):
            baidu = data_sources.get("baidu_tiyu")
            if isinstance(baidu, dict):
                return str(baidu.get("encoded_match_id") or "").strip()
        return ""

    @staticmethod
    def _attach_unavailable_context(match: dict[str, Any], *, error: str) -> None:
        team_context = match.setdefault("team_context", {})
        if isinstance(team_context, dict):
            team_context["baidu_sports"] = {
                "status": "unavailable",
                "provider": "baidu_tiyu",
                "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "error": str(error)[:300],
            }

    @staticmethod
    def _attach_skipped_context(match: dict[str, Any]) -> None:
        team_context = match.setdefault("team_context", {})
        if isinstance(team_context, dict):
            team_context["baidu_sports"] = {
                "status": "skipped",
                "provider": "baidu_tiyu",
                "reason": "超过单次任务 Baidu 体育上下文补充上限",
            }


def normalize_worldcup_team_name(value: Any) -> str:
    text = str(value or "").strip()
    return re.sub(r"[\s·•　（）()/-]+", "", text)
