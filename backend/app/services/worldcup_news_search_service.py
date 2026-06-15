from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests

from backend.app.config import Settings, load_settings
from backend.app.logging_utils import get_logger


BING_NEWS_RSS_URL = "https://www.bing.com/news/search"
GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
NEWS_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
)


class WorldCupNewsSearchService:
    def __init__(self, settings: Settings | None = None, session: requests.Session | None = None) -> None:
        self.settings = settings or load_settings()
        self.session = session or requests.Session()
        self.logger = get_logger("services.worldcup_news_search")

    def enrich_matches(self, matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not matches:
            return matches

        if not self.settings.worldcup_news_search_enabled:
            for match in matches:
                self._set_match_news(match, self._status_payload(self._build_query(match), status="disabled", provider="none"))
            return matches

        max_matches = max(1, int(self.settings.worldcup_news_search_max_matches))
        for index, match in enumerate(matches):
            query = self._build_query(match)
            if index >= max_matches:
                self._set_match_news(match, self._status_payload(query, status="skipped", provider="none"))
                continue
            try:
                news_payload = self.search_news(match)
            except Exception as exc:
                self.logger.warning(
                    "WorldCup news search failed",
                    extra={"context": {"match_id": match.get("match_id"), "error": str(exc)[:240]}},
                )
                news_payload = self._status_payload(query, status="unavailable", provider="none", error=str(exc))
            self._set_match_news(match, news_payload)
        return matches

    def search_news(self, match: dict[str, Any]) -> dict[str, Any]:
        query = self._build_query(match)
        max_results = max(1, int(self.settings.worldcup_news_search_max_results))
        provider_errors: list[str] = []
        had_success = False

        for provider_name, fetcher in (
            ("Bing News RSS", self._fetch_bing_news),
            ("GDELT DOC", self._fetch_gdelt_doc),
        ):
            try:
                results = fetcher(query, max_results=max_results * 2)
                had_success = True
            except Exception as exc:
                provider_errors.append(f"{provider_name}: {exc}")
                continue

            limited_results = self._dedupe_and_limit(results, max_results=max_results)
            if limited_results:
                return self._status_payload(
                    query,
                    status="available",
                    provider=provider_name,
                    results=limited_results,
                )

        status = "no_results" if had_success else "unavailable"
        return self._status_payload(
            query,
            status=status,
            provider="none",
            error="; ".join(provider_errors) if provider_errors else None,
        )

    def _fetch_bing_news(self, query: str, *, max_results: int) -> list[dict[str, str]]:
        response = self.session.get(
            BING_NEWS_RSS_URL,
            params={"q": query, "format": "rss"},
            timeout=int(self.settings.worldcup_news_search_timeout_seconds),
            headers={"Accept": "application/rss+xml,application/xml,text/xml,*/*", "User-Agent": NEWS_USER_AGENT},
        )
        response.raise_for_status()
        return self._parse_bing_rss(response.text, max_results=max_results)

    def _fetch_gdelt_doc(self, query: str, *, max_results: int) -> list[dict[str, str]]:
        response = self.session.get(
            GDELT_DOC_URL,
            params={
                "query": query,
                "mode": "artlist",
                "format": "json",
                "timespan": "72H",
                "maxrecords": max(1, min(200, int(max_results))),
                "sort": "datedesc",
            },
            timeout=int(self.settings.worldcup_news_search_timeout_seconds),
            headers={"Accept": "application/json,text/plain,*/*", "User-Agent": NEWS_USER_AGENT},
        )
        response.raise_for_status()
        payload = response.json()
        return self._parse_gdelt_payload(payload, max_results=max_results)

    def _parse_bing_rss(self, xml_text: str, *, max_results: int) -> list[dict[str, str]]:
        root = ET.fromstring(xml_text)
        results: list[dict[str, str]] = []
        for item in root.findall(".//item"):
            title = self._clean_text(self._xml_child_text(item, "title"), limit=160)
            url = self._truncate(self._decode_bing_url(self._xml_child_text(item, "link")), limit=500)
            snippet = self._clean_text(self._xml_child_text(item, "description"), limit=280)
            source = self._clean_text(self._xml_child_text(item, "source"), limit=80) or self._source_from_url(url)
            published_at = self._normalize_published_at(self._xml_child_text(item, "pubDate"))
            if not title and not url:
                continue
            results.append(
                {
                    "title": title,
                    "snippet": snippet,
                    "source": source,
                    "published_at": published_at,
                    "url": url,
                }
            )
        return self._dedupe_and_limit(results, max_results=max_results)

    def _parse_gdelt_payload(self, payload: dict[str, Any], *, max_results: int) -> list[dict[str, str]]:
        articles = payload.get("articles") if isinstance(payload, dict) else []
        if not isinstance(articles, list):
            articles = payload.get("results") if isinstance(payload, dict) else []
        results: list[dict[str, str]] = []
        for item in articles or []:
            if not isinstance(item, dict):
                continue
            url = self._truncate(str(item.get("url") or item.get("link") or "").strip(), limit=500)
            title = self._clean_text(str(item.get("title") or ""), limit=160)
            snippet = self._clean_text(str(item.get("snippet") or item.get("summary") or ""), limit=280)
            source = self._clean_text(str(item.get("source") or item.get("domain") or ""), limit=80) or self._source_from_url(url)
            published_at = self._normalize_published_at(
                item.get("seendate") or item.get("published_at") or item.get("publishedDate") or item.get("date")
            )
            if not title and not url:
                continue
            results.append(
                {
                    "title": title,
                    "snippet": snippet,
                    "source": source,
                    "published_at": published_at,
                    "url": url,
                }
            )
        return self._dedupe_and_limit(results, max_results=max_results)

    def _build_query(self, match: dict[str, Any]) -> str:
        home_team = self._clean_text(str(match.get("home_team") or ""), limit=80)
        away_team = self._clean_text(str(match.get("away_team") or ""), limit=80)
        teams = " ".join(value for value in (home_team, away_team) if value)
        return f"{teams} 世界杯 阵容 伤停 最新 team news".strip()

    def _set_match_news(self, match: dict[str, Any], news_payload: dict[str, Any]) -> None:
        team_context = match.setdefault("team_context", {})
        if not isinstance(team_context, dict):
            team_context = {}
            match["team_context"] = team_context
        team_context["news"] = news_payload
        team_context["status"] = self._team_context_status(news_payload)

    @staticmethod
    def _team_context_status(news_payload: dict[str, Any]) -> str:
        status = str(news_payload.get("status") or "")
        if status == "available":
            return "已接入球队最新资讯搜索；官方赔率仅用于玩法校验、赔率展示和风险提示。"
        if status == "disabled":
            return "球队资讯搜索已关闭；官方赔率仅用于玩法校验、赔率展示和风险提示。"
        if status == "skipped":
            return "超过本次新闻搜索比赛上限；官方赔率仅用于玩法校验、赔率展示和风险提示。"
        if status == "no_results":
            return "未搜索到可用球队最新资讯；官方赔率仅用于玩法校验、赔率展示和风险提示。"
        return "球队资讯搜索暂不可用；官方赔率仅用于玩法校验、赔率展示和风险提示。"

    @staticmethod
    def _status_payload(
        query: str,
        *,
        status: str,
        provider: str,
        results: list[dict[str, str]] | None = None,
        error: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "status": status,
            "query": query,
            "provider": provider,
            "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "results": results or [],
        }
        if error:
            payload["error"] = WorldCupNewsSearchService._truncate(str(error), limit=300)
        return payload

    @classmethod
    def _dedupe_and_limit(cls, results: list[dict[str, str]], *, max_results: int) -> list[dict[str, str]]:
        seen: set[str] = set()
        deduped: list[dict[str, str]] = []
        for result in results:
            title = cls._clean_text(str(result.get("title") or ""), limit=160)
            url = cls._truncate(str(result.get("url") or "").strip(), limit=500)
            key = cls._dedupe_key(url=url, title=title)
            if not key or key in seen:
                continue
            seen.add(key)
            deduped.append(
                {
                    "title": title,
                    "snippet": cls._clean_text(str(result.get("snippet") or ""), limit=280),
                    "source": cls._clean_text(str(result.get("source") or ""), limit=80) or cls._source_from_url(url),
                    "published_at": cls._truncate(str(result.get("published_at") or ""), limit=64),
                    "url": url,
                }
            )
            if len(deduped) >= max(1, int(max_results)):
                break
        return deduped

    @staticmethod
    def _dedupe_key(*, url: str, title: str) -> str:
        if url:
            parsed = urlparse(url)
            return f"url:{parsed.netloc.lower()}{parsed.path.lower()}".rstrip("/")
        if title:
            return f"title:{title.lower()}"
        return ""

    @staticmethod
    def _decode_bing_url(url: str) -> str:
        text = html.unescape(str(url or "").strip())
        parsed = urlparse(text)
        query_params = parse_qs(parsed.query)
        for key in ("url", "u"):
            values = query_params.get(key)
            if values and values[0]:
                return html.unescape(values[0].strip())
        return text

    @staticmethod
    def _xml_child_text(element: ET.Element, local_name: str) -> str:
        wanted = local_name.strip().lower()
        for child in list(element):
            tag = str(child.tag).split("}", 1)[-1].lower()
            if tag == wanted:
                return str(child.text or "").strip()
        return ""

    @classmethod
    def _clean_text(cls, value: str, *, limit: int) -> str:
        text = html.unescape(str(value or ""))
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return cls._truncate(text, limit=limit)

    @staticmethod
    def _truncate(value: str, *, limit: int) -> str:
        text = str(value or "").strip()
        if len(text) <= limit:
            return text
        return text[:limit].rstrip()

    @staticmethod
    def _source_from_url(url: str) -> str:
        parsed = urlparse(str(url or ""))
        return parsed.netloc.replace("www.", "")[:80]

    @classmethod
    def _normalize_published_at(cls, value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        if text.isdigit() and len(text) == 14:
            try:
                return datetime.strptime(text, "%Y%m%d%H%M%S").strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                pass
        try:
            parsed = parsedate_to_datetime(text)
            if parsed.tzinfo is not None:
                parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
            return parsed.strftime("%Y-%m-%d %H:%M:%S")
        except (TypeError, ValueError):
            pass
        try:
            parsed_iso = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed_iso.tzinfo is not None:
                parsed_iso = parsed_iso.astimezone(timezone.utc).replace(tzinfo=None)
            return parsed_iso.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            return cls._truncate(text, limit=64)
