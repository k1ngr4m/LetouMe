from __future__ import annotations

from datetime import datetime
import re
from typing import Any

import requests

from backend.app.logging_utils import get_logger
from backend.app.repositories.worldcup_repository import WorldCupRepository
from backend.app.services.worldcup_baidu_sports_service import WorldCupBaiduSportsService, normalize_worldcup_team_name
from backend.app.time_utils import now_ts


SPORTTERY_MATCH_LIST_URL = "https://webapi.sporttery.cn/gateway/uniform/football/getMatchListV1.qry"
SPORTTERY_CALCULATOR_URL = "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry"
SPORTTERY_CLIENT_CODE = "3001"
SPORTTERY_CHANNEL = "c"
SPORTTERY_POOL_CODE = "had,hhad,ttg,crs,hafu"

SPORTTERY_PLAY_TYPE_MAP = {
    "HAD": "win_draw_win",
    "HHAD": "handicap_win_draw_win",
    "TTG": "total_goals",
    "CRS": "correct_score",
    "HAFU": "half_full_time",
}


class WorldCupFetchService:
    def __init__(
        self,
        repository: WorldCupRepository | None = None,
        baidu_sports_service: WorldCupBaiduSportsService | None = None,
    ) -> None:
        self.repository = repository or WorldCupRepository()
        self.baidu_sports_service = baidu_sports_service or WorldCupBaiduSportsService()
        self.logger = get_logger("services.worldcup_fetch")

    def fetch_and_save(self) -> dict[str, Any]:
        match_payload = self._fetch_json(SPORTTERY_MATCH_LIST_URL, params={"clientCode": SPORTTERY_CLIENT_CODE})
        calculator_payload = self._fetch_json(
            SPORTTERY_CALCULATOR_URL,
            params={"channel": SPORTTERY_CHANNEL, "poolCode": SPORTTERY_POOL_CODE},
        )
        matches = self._parse_matches(match_payload)
        odds_rows = self._parse_odds(calculator_payload)
        baidu_matches: list[dict[str, Any]] = []
        baidu_error: str | None = None
        try:
            baidu_matches = self.baidu_sports_service.fetch_schedule_matches()
            baidu_matches = self._attach_baidu_half_time_scores(baidu_matches)
            matches = self._merge_baidu_matches(matches, baidu_matches)
        except Exception as exc:
            baidu_error = str(exc)
            self.logger.warning(
                "Baidu sports schedule enrichment failed; continuing with Sporttery data",
                extra={"context": {"error": baidu_error[:240]}},
            )
        match_ids = {item["match_id"] for item in matches}
        odds_rows = [row for row in odds_rows if row["match_id"] in match_ids]
        saved_matches = self.repository.upsert_matches(matches)
        saved_odds = self.repository.upsert_odds_snapshots(odds_rows)
        latest_match = max(matches, key=lambda item: item.get("kickoff_at") or "", default=None)
        summary = {
            "lottery_code": "worldcup",
            "fetched_count": len(matches) + len(odds_rows),
            "saved_count": saved_matches + saved_odds,
            "match_count": saved_matches,
            "odds_count": saved_odds,
            "baidu_match_count": len(baidu_matches),
            "latest_period": (latest_match.get("match_num_str") or latest_match.get("kickoff_at")) if latest_match else None,
            "duration_ms": 0,
        }
        if baidu_error:
            summary["baidu_error"] = baidu_error
        return summary

    def _fetch_json(self, url: str, *, params: dict[str, str]) -> dict[str, Any]:
        response = requests.get(
            url,
            params=params,
            timeout=20,
            headers={
                "Accept": "application/json,text/plain,*/*",
                "Referer": "https://www.sporttery.cn/jc/zqszsc/index.html",
                "Origin": "https://www.sporttery.cn",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
            },
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or str(payload.get("errorCode", "0")) not in {"0", ""}:
            raise ValueError(str(payload.get("errorMessage") or "中国竞彩网接口返回异常"))
        return payload

    def _parse_matches(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        value = payload.get("value") if isinstance(payload, dict) else {}
        source_updated_at = self._parse_source_time(value.get("lastUpdateTime") if isinstance(value, dict) else None)
        result: dict[str, dict[str, Any]] = {}
        for match in self._iter_match_items(value):
            league_name = str(match.get("leagueAllName") or match.get("leagueAbbName") or "")
            if "世界杯" not in league_name:
                continue
            match_id = self._match_id(match)
            result[match_id] = {
                "match_id": match_id,
                "sporttery_match_id": str(match.get("matchId") or ""),
                "match_num": str(match.get("matchNum") or ""),
                "match_num_str": str(match.get("matchNumStr") or ""),
                "match_num_date": str(match.get("matchNumDate") or ""),
                "tax_date_no": str(match.get("taxDateNo") or ""),
                "home_team": str(match.get("homeTeamAllName") or match.get("homeTeamAbbName") or ""),
                "away_team": str(match.get("awayTeamAllName") or match.get("awayTeamAbbName") or ""),
                "kickoff_at": self._kickoff_at(match),
                "stage": league_name or "世界杯",
                "league_name": league_name or "世界杯",
                "business_date": str(match.get("businessDate") or ""),
                "sell_status": str(match.get("sellStatus") or match.get("matchStatus") or ""),
                "match_status": self._normalize_match_status(match.get("matchStatus") or match.get("sellStatus")),
                "score": None,
                "half_time_score": None,
                "remark": str(match.get("remark") or ""),
                "data_sources": ["sporttery"],
                "source_updated_at": source_updated_at,
            }
        return list(result.values())

    def _parse_odds(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        value = payload.get("value") if isinstance(payload, dict) else {}
        source_updated_at = self._parse_source_time(value.get("lastUpdateTime") if isinstance(value, dict) else None)
        fetched_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        result: list[dict[str, Any]] = []
        for match in self._iter_match_items(value):
            league_name = str(match.get("leagueAllName") or match.get("leagueAbbName") or "")
            if "世界杯" not in league_name:
                continue
            match_id = self._match_id(match)
            pool_status_by_code = {
                str(pool.get("poolCode") or "").upper(): pool
                for pool in (match.get("poolList") or [])
                if isinstance(pool, dict)
            }
            for sporttery_code, play_type in SPORTTERY_PLAY_TYPE_MAP.items():
                key = sporttery_code.lower()
                odds_payload = match.get(key)
                if not isinstance(odds_payload, dict):
                    odds_payload = self._odds_from_list(match.get("oddsList"), sporttery_code)
                if not isinstance(odds_payload, dict) or not odds_payload:
                    continue
                pool_status = pool_status_by_code.get(sporttery_code, {})
                result.append(
                    {
                        "odds_id": f"{match_id}-{play_type}",
                        "match_id": match_id,
                        "play_type": play_type,
                        "odds": self._normalize_odds_payload(play_type, odds_payload),
                        "goal_line": str(odds_payload.get("goalLine") or odds_payload.get("fixedodds") or ""),
                        "single_status": str(pool_status.get("cbtSingle") or pool_status.get("single") or odds_payload.get("single") or ""),
                        "sell_status": str(pool_status.get("poolStatus") or match.get("sellStatus") or match.get("matchStatus") or ""),
                        "source": "sporttery",
                        "source_updated_at": source_updated_at,
                        "fetched_at": fetched_at,
                    }
                )
        return result

    @classmethod
    def _merge_baidu_matches(cls, sporttery_matches: list[dict[str, Any]], baidu_matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
        merged = [dict(match) for match in sporttery_matches]
        existing_by_signature = {cls._match_signature(match): match for match in merged}
        for baidu_match in baidu_matches:
            signature = cls._match_signature(baidu_match)
            existing = existing_by_signature.get(signature)
            if existing is None:
                merged.append(dict(baidu_match))
                existing_by_signature[signature] = merged[-1]
                continue
            existing["data_sources"] = cls._merge_data_sources(existing.get("data_sources"), baidu_match.get("data_sources"))
            if not existing.get("score") and baidu_match.get("score"):
                existing["score"] = baidu_match.get("score")
            if not existing.get("half_time_score") and baidu_match.get("half_time_score"):
                existing["half_time_score"] = baidu_match.get("half_time_score")
            if baidu_match.get("match_status") in {"live", "finished"}:
                existing["match_status"] = baidu_match.get("match_status")
            if baidu_match.get("source_updated_at"):
                existing["source_updated_at"] = max(str(existing.get("source_updated_at") or ""), str(baidu_match.get("source_updated_at") or "")) or None
        return merged

    def _attach_baidu_half_time_scores(self, matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for match in matches:
            if str(match.get("match_status") or "") not in {"live", "finished"}:
                continue
            encoded_match_id = self._extract_baidu_encoded_match_id(match.get("data_sources"))
            if not encoded_match_id:
                continue
            try:
                half_time_score = self.baidu_sports_service.fetch_half_time_score(encoded_match_id)
            except Exception as exc:
                self.logger.warning(
                    "Baidu sports half-time score unavailable; continuing without half-full-time settlement",
                    extra={"context": {"match_id": match.get("match_id"), "error": str(exc)[:240]}},
                )
                continue
            if half_time_score:
                match["half_time_score"] = half_time_score
        return matches

    @staticmethod
    def _extract_baidu_encoded_match_id(data_sources: Any) -> str:
        if not isinstance(data_sources, dict):
            return ""
        baidu_source = data_sources.get("baidu_tiyu")
        if not isinstance(baidu_source, dict):
            return ""
        return str(baidu_source.get("encoded_match_id") or "").strip()

    @staticmethod
    def _match_signature(match: dict[str, Any]) -> tuple[str, str, str]:
        return (
            str(match.get("kickoff_at") or "")[:16],
            normalize_worldcup_team_name(match.get("home_team")),
            normalize_worldcup_team_name(match.get("away_team")),
        )

    @staticmethod
    def _merge_data_sources(left: Any, right: Any) -> dict[str, Any] | list[Any]:
        if not isinstance(right, dict):
            return left if left else ["sporttery"]
        if not isinstance(left, dict):
            sources = [str(item) for item in left] if isinstance(left, list) else []
            left = {"sources": sources}
        sources = []
        for source in [*(left.get("sources") or []), *(right.get("sources") or [])]:
            text = str(source or "").strip()
            if text and text not in sources:
                sources.append(text)
        result = dict(left)
        result["sources"] = sources
        for key, value in right.items():
            if key != "sources":
                result[key] = value
        return result

    @staticmethod
    def _iter_match_items(value: Any):
        if not isinstance(value, dict):
            return
        for day in value.get("matchInfoList") or []:
            if not isinstance(day, dict):
                continue
            for match in day.get("subMatchList") or []:
                if isinstance(match, dict):
                    yield match

    @staticmethod
    def _match_id(match: dict[str, Any]) -> str:
        raw_id = str(match.get("matchId") or match.get("id") or "").strip()
        return f"sporttery-{raw_id}" if raw_id else f"sporttery-{match.get('matchNumDate')}-{match.get('matchNum')}"

    @staticmethod
    def _kickoff_at(match: dict[str, Any]) -> str:
        date_value = str(match.get("matchDate") or match.get("date") or "").strip()
        time_value = str(match.get("matchTime") or match.get("time") or "00:00").strip()
        return f"{date_value} {time_value[:5]}:00" if date_value else datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def _normalize_match_status(value: Any) -> str:
        text = str(value or "").strip().lower()
        if text in {"finished", "played", "ended"} or "finish" in text:
            return "finished"
        if text in {"live", "inprogress"} or "live" in text:
            return "live"
        return "scheduled"

    @staticmethod
    def _odds_from_list(odds_list: Any, pool_code: str) -> dict[str, Any]:
        if not isinstance(odds_list, list):
            return {}
        for item in odds_list:
            if isinstance(item, dict) and str(item.get("poolCode") or "").upper() == pool_code:
                return item
        return {}

    @staticmethod
    def _normalize_odds_payload(play_type: str, payload: dict[str, Any]) -> dict[str, str]:
        if play_type in {"win_draw_win", "handicap_win_draw_win"}:
            return {
                "胜": str(payload.get("h") or ""),
                "平": str(payload.get("d") or ""),
                "负": str(payload.get("a") or ""),
            }
        if play_type == "total_goals":
            return {str(index): str(payload.get(f"s{index}") or "") for index in range(8)}
        if play_type == "half_full_time":
            labels = {
                "hh": "胜胜",
                "hd": "胜平",
                "ha": "胜负",
                "dh": "平胜",
                "dd": "平平",
                "da": "平负",
                "ah": "负胜",
                "ad": "负平",
                "aa": "负负",
            }
            return {label: str(payload.get(key) or "") for key, label in labels.items()}
        if play_type == "correct_score":
            return {
                WorldCupFetchService._format_correct_score_label(str(key)): str(value).strip()
                for key, value in payload.items()
                if str(key).startswith("s")
                and not str(key).strip().lower().endswith("f")
                and WorldCupFetchService._is_valid_odds_value(value)
            }
        return {str(key): str(value) for key, value in payload.items() if value not in (None, "")}

    @staticmethod
    def _format_correct_score_label(key: str) -> str:
        text = key.strip().lower()
        if text == "s90":
            return "胜其它"
        if text == "s99":
            return "平其它"
        if text == "s09":
            return "负其它"
        other_match = {
            "s1sh": "胜其它",
            "s1sd": "平其它",
            "s1sa": "负其它",
        }.get(text)
        if other_match:
            return other_match
        combined_score_match = re.fullmatch(r"s(\d{2})s(\d{2})", text)
        if combined_score_match:
            return f"{int(combined_score_match.group(1))}:{int(combined_score_match.group(2))}"
        if len(text) == 3 and text.startswith("s") and text[1:].isdigit():
            return f"{int(text[1])}:{int(text[2])}"
        return key

    @staticmethod
    def _is_valid_odds_value(value: Any) -> bool:
        text = str(value or "").strip()
        if not text:
            return False
        try:
            return float(text) > 0
        except ValueError:
            return True

    @staticmethod
    def _parse_source_time(value: Any) -> str | None:
        text = str(value or "").strip()
        if not text:
            return None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%m-%d %H:%M"):
            try:
                parsed = datetime.strptime(text, fmt)
                if fmt == "%m-%d %H:%M":
                    parsed = parsed.replace(year=datetime.now().year)
                return parsed.strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                continue
        return None
