from __future__ import annotations

import re
import time
from datetime import date, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.lotteries import (
    build_pl3_prize_breakdown,
    build_pl5_prize_breakdown,
    build_qxc_prize_breakdown,
    normalize_digit_balls,
    normalize_lottery_code,
)
from backend.app.services.lottery_service import LotteryService
from backend.app.services.message_service import MessageService


class LotteryFetchService:
    SPORTTERY_HISTORY_URL = "https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry"
    SPORTTERY_GAME_NUMS = {
        "dlt": "85",
        "pl3": "35",
        "pl5": "350133",
        "qxc": "04",
    }
    SPORTTERY_REFERERS = {
        "dlt": "https://m.lottery.gov.cn/zst/dlt/",
        "pl3": "https://m.lottery.gov.cn/zst/pls/",
        "pl5": "https://m.lottery.gov.cn/zst/plw/",
        "qxc": "https://m.lottery.gov.cn/zst/qxc/",
    }
    SPORTTERY_DETAIL_PAGE_SIZE = 100
    SPORTTERY_DETAIL_MAX_PAGES = 40
    FALLBACK_HISTORY_URLS = {
        "dlt": "https://datachart.500.com/dlt/history/newinc/history.php",
        "pl3": "https://datachart.500.com/pls/history/inc/history.php",
        "pl5": "https://datachart.500.com/plw/history/inc/history.php",
        "qxc": "https://datachart.500.com/qxc/history/inc/history.php",
    }
    FALLBACK_HISTORY_REFERERS = {
        "dlt": "https://datachart.500.com/dlt/history/history.shtml",
        "pl3": "https://datachart.500.com/pls/history/history.shtml",
        "pl5": "https://datachart.500.com/plw/history/history.shtml",
        "qxc": "https://datachart.500.com/qxc/history/history.shtml",
    }
    DETAIL_URL_TEMPLATES = {
        "dlt": "https://kaijiang.500.com/shtml/dlt/{period}.shtml",
        "pl3": "https://kaijiang.500.com/shtml/pls/{period}.shtml",
        "pl5": "https://kaijiang.500.com/shtml/plw/{period}.shtml",
        "qxc": "https://kaijiang.500.com/shtml/qxc/{period}.shtml",
    }
    FIXED_PRIZE_RULES = {
        "三等奖": 10000,
        "四等奖": 3000,
        "五等奖": 300,
        "六等奖": 200,
        "七等奖": 100,
        "八等奖": 15,
        "九等奖": 5,
        "三等奖": 3000,
        "四等奖": 500,
        "五等奖": 30,
        "六等奖": 5,
    }

    def __init__(
        self,
        lottery_service: LotteryService | None = None,
        lottery_code: str = "dlt",
        message_service: MessageService | None = None,
    ) -> None:
        self.lottery_code = normalize_lottery_code(lottery_code)
        self.base_url = self.FALLBACK_HISTORY_URLS.get(self.lottery_code, self.SPORTTERY_HISTORY_URL)
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/91.0.4472.124 Safari/537.36"
            ),
            "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": self.SPORTTERY_REFERERS.get(self.lottery_code, "https://m.lottery.gov.cn/zst/tbsj/"),
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        self._sporttery_history_page_cache: dict[tuple[int, int], list[dict[str, Any]]] = {}
        ensure_schema()
        self.lottery_service = lottery_service or LotteryService()
        self.message_service = message_service or MessageService()
        self.logger = get_logger("services.lottery_fetch")

    def fetch_and_save(
        self,
        *,
        start: str | None = None,
        end: str | None = None,
        limit: int | None = 30,
    ) -> dict[str, Any]:
        started_at = time.perf_counter()
        normalized_limit = max(1, int(limit or 30))
        lottery_data = self.fetch_history_with_fallback(limit=normalized_limit, start=start, end=end)
        if not lottery_data:
            raise ValueError("未解析到开奖数据")
        if self.lottery_code == "qxc" and len(lottery_data) < normalized_limit:
            lottery_data = self._backfill_qxc_draws(lottery_data, target_count=normalized_limit)
        lottery_data = lottery_data[:normalized_limit]
        saved_draws = self.lottery_service.save_draws(lottery_data, lottery_code=self.lottery_code)
        generated_message_count = 0
        message_service = getattr(self, "message_service", None)
        if message_service:
            recent_periods = [str(item.get("period") or "").strip() for item in saved_draws if str(item.get("period") or "").strip()]
            generated_message_count += message_service.generate_messages_for_periods(
                lottery_code=self.lottery_code,
                periods=recent_periods,
            )
            generated_message_count += message_service.generate_messages_for_recent_draws(
                lottery_code=self.lottery_code,
                recent_days=30,
                limit=500,
                excluded_periods=set(recent_periods),
            )
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        summary = {
            "lottery_code": self.lottery_code,
            "fetched_count": len(lottery_data),
            "saved_count": len(saved_draws),
            "message_generated_count": generated_message_count,
            "latest_period": saved_draws[0]["period"] if saved_draws else None,
            "duration_ms": duration_ms,
        }
        self.logger.info("Fetched and saved lottery history", extra={"context": summary})
        return summary

    def fetch_lskj_and_save(self, *, limit: int = 100) -> dict[str, Any]:
        started_at = time.perf_counter()
        normalized_limit = max(1, int(limit))
        lottery_data = self.fetch_history_with_fallback(limit=normalized_limit)
        if not lottery_data:
            raise ValueError("未解析到开奖数据")
        if self.lottery_code == "qxc" and len(lottery_data) < normalized_limit:
            lottery_data = self._backfill_qxc_draws(lottery_data, target_count=normalized_limit)
        lottery_data = lottery_data[:normalized_limit]
        saved_draws = self.lottery_service.save_draws(lottery_data, lottery_code=self.lottery_code)
        generated_message_count = 0
        message_service = getattr(self, "message_service", None)
        if message_service:
            recent_periods = [str(item.get("period") or "").strip() for item in saved_draws if str(item.get("period") or "").strip()]
            generated_message_count += message_service.generate_messages_for_periods(
                lottery_code=self.lottery_code,
                periods=recent_periods,
            )
            generated_message_count += message_service.generate_messages_for_recent_draws(
                lottery_code=self.lottery_code,
                recent_days=30,
                limit=500,
                excluded_periods=set(recent_periods),
            )
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        summary = {
            "lottery_code": self.lottery_code,
            "fetched_count": len(lottery_data),
            "saved_count": len(saved_draws),
            "message_generated_count": generated_message_count,
            "latest_period": saved_draws[0]["period"] if saved_draws else None,
            "duration_ms": duration_ms,
        }
        self.logger.info("Fetched and saved lottery lskj history", extra={"context": summary})
        return summary

    def fetch_history_with_fallback(
        self,
        *,
        limit: int,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        normalized_limit = max(1, int(limit))
        try:
            lottery_data = self.fetch_sporttery_history(limit=normalized_limit)
        except Exception as exc:
            lottery_data = []
            self.logger.warning(
                "Sporttery lottery history failed; falling back to 500 datachart",
                extra={"context": {"lottery_code": self.lottery_code, "error": str(exc)}},
            )
        if lottery_data:
            return lottery_data[:normalized_limit]

        self.logger.warning(
            "Sporttery lottery history returned no draws; falling back to 500 datachart",
            extra={"context": {"lottery_code": self.lottery_code, "limit": normalized_limit}},
        )
        return self.fetch_fallback_history(limit=normalized_limit, start=start, end=end)[:normalized_limit]

    def fetch_sporttery_history(self, *, limit: int) -> list[dict[str, Any]]:
        rows = self.fetch_sporttery_history_page(page_no=1, page_size=max(1, int(limit)))
        parsed = [self.parse_sporttery_draw(row) for row in rows]
        return [item for item in parsed if item][: max(1, int(limit))]

    def fetch_sporttery_history_page(self, *, page_no: int = 1, page_size: int = 30) -> list[dict[str, Any]]:
        cache_key = (max(1, int(page_no)), max(1, int(page_size)))
        cache = getattr(self, "_sporttery_history_page_cache", None)
        if cache is None:
            cache = {}
            self._sporttery_history_page_cache = cache
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        game_no = self.SPORTTERY_GAME_NUMS.get(self.lottery_code)
        if not game_no:
            raise ValueError(f"不支持的历史开奖列表源：{self.lottery_code}")
        url = self.build_sporttery_history_url(page_no=cache_key[0], page_size=cache_key[1])
        if hasattr(self, "session"):
            self.session.headers.update(
                {"Referer": self.SPORTTERY_REFERERS.get(self.lottery_code, "https://m.lottery.gov.cn/zst/tbsj/")}
            )
        payload = self.fetch_json(url)
        value = payload.get("value") if isinstance(payload, dict) else None
        rows = list((value or {}).get("list") or []) if isinstance(value, dict) else []
        cache[cache_key] = rows
        return rows

    def build_sporttery_history_url(self, *, page_no: int = 1, page_size: int = 30) -> str:
        game_no = self.SPORTTERY_GAME_NUMS.get(self.lottery_code)
        if not game_no:
            raise ValueError(f"不支持的历史开奖列表源：{self.lottery_code}")
        query = urlencode(
            {
                "gameNo": game_no,
                "provinceId": 0,
                "pageSize": max(1, int(page_size)),
                "isVerify": 1,
                "pageNo": max(1, int(page_no)),
            }
        )
        return f"{self.SPORTTERY_HISTORY_URL}?{query}"

    def fetch_fallback_history(
        self,
        *,
        limit: int,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        url = self.build_fallback_history_url(limit=limit, start=start, end=end)
        if not url:
            raise ValueError(f"不支持的历史开奖列表兜底源：{self.lottery_code}")
        referer = self.FALLBACK_HISTORY_REFERERS.get(self.lottery_code)
        if referer and hasattr(self, "session"):
            self.session.headers.update({"Referer": referer})
        soup = self.fetch_page(url)
        if not soup:
            return []
        parsed = self.parse_lskj_data(soup)
        return parsed[: max(1, int(limit))]

    def build_fallback_history_url(
        self,
        *,
        limit: int | None = None,
        start: str | None = None,
        end: str | None = None,
    ) -> str | None:
        base_url = getattr(self, "base_url", None) or self.FALLBACK_HISTORY_URLS.get(self.lottery_code)
        if not base_url:
            return None
        params: dict[str, Any] = {}
        if start:
            params["start"] = start
        if end:
            params["end"] = end
        if limit is not None:
            params["limit"] = max(1, int(limit))
        if not params:
            return base_url
        separator = "&" if "?" in base_url else "?"
        return f"{base_url}{separator}{urlencode(params)}"

    def fetch_json(self, url: str, retry: int = 3) -> dict[str, Any]:
        for attempt in range(retry):
            try:
                self.logger.info(
                    "Fetching lottery history json",
                    extra={"context": {"attempt": attempt + 1, "retry": retry, "url": url}},
                )
                response = self.session.get(url, timeout=30)
                if response.status_code == 200:
                    try:
                        payload = response.json()
                    except ValueError:
                        payload = None
                    if isinstance(payload, dict) and str(payload.get("errorCode")) == "0":
                        return payload
                    self.logger.warning(
                        "Unexpected lottery json payload",
                        extra={
                            "context": {
                                "status_code": response.status_code,
                                "content_type": response.headers.get("Content-Type"),
                                "error_code": payload.get("errorCode") if isinstance(payload, dict) else None,
                            }
                        },
                    )
                else:
                    self.logger.warning("Unexpected HTTP status", extra={"context": {"status_code": response.status_code}})
            except requests.exceptions.RequestException as exc:
                self.logger.warning("Lottery history request failed", extra={"context": {"error": str(exc)}})
            if attempt < retry - 1:
                time.sleep(2)
        return {}

    def parse_sporttery_draw(self, row: dict[str, Any]) -> dict[str, Any] | None:
        period = str(row.get("lotteryDrawNum") or "").strip()
        draw_result = str(row.get("lotteryDrawResult") or "").strip()
        if not period or not draw_result:
            return None
        numbers = re.findall(r"\d{1,2}", draw_result)
        if self.lottery_code == "dlt":
            if len(numbers) < 7:
                return None
            return {
                "period": period,
                "red_balls": [value.zfill(2) for value in numbers[:5]],
                "blue_balls": [value.zfill(2) for value in numbers[5:7]],
                "date": self._normalize_sporttery_draw_date(row.get("lotteryDrawTime")),
                "sales_amount": self.parse_money_value(str(row.get("totalSaleAmount") or "")),
                "jackpot_pool_balance": self.parse_money_value(str(row.get("poolBalanceAfterdraw") or row.get("poolBalance") or "")),
                "prize_total_amount": self._sum_sporttery_prize_total(row.get("prizeLevelList")),
                "prize_breakdown": self.parse_sporttery_prize_breakdown(row.get("prizeLevelList")),
            }
        if self.lottery_code in {"pl3", "pl5", "qxc"}:
            expected_count = 3 if self.lottery_code == "pl3" else 5 if self.lottery_code == "pl5" else 7
            if len(numbers) < expected_count:
                return None
            fallback_breakdown = (
                build_pl3_prize_breakdown()
                if self.lottery_code == "pl3"
                else build_pl5_prize_breakdown()
                if self.lottery_code == "pl5"
                else build_qxc_prize_breakdown()
            )
            return {
                "period": period,
                "digits": normalize_digit_balls(numbers[:expected_count]),
                "date": self._normalize_sporttery_draw_date(row.get("lotteryDrawTime")),
                "sales_amount": self.parse_money_value(str(row.get("totalSaleAmount") or "")),
                "jackpot_pool_balance": self.parse_money_value(str(row.get("poolBalanceAfterdraw") or row.get("poolBalance") or "")),
                "prize_total_amount": self._sum_sporttery_prize_total(row.get("prizeLevelList")),
                "prize_breakdown": self.parse_sporttery_prize_breakdown(row.get("prizeLevelList")) or fallback_breakdown,
            }
        return None

    def parse_sporttery_prize_breakdown(self, prize_rows: Any) -> list[dict[str, Any]]:
        breakdown: list[dict[str, Any]] = []
        for prize in list(prize_rows or []):
            if not isinstance(prize, dict):
                continue
            prize_level = str(prize.get("prizeLevel") or "").strip()
            if not prize_level:
                continue
            breakdown.append(
                {
                    "prize_level": prize_level.replace("(追加)", ""),
                    "prize_type": "additional" if "追加" in prize_level else "basic",
                    "winner_count": self.parse_money_value(str(prize.get("stakeCount") or "")),
                    "prize_amount": self.parse_money_value(str(prize.get("stakeAmountFormat") or prize.get("stakeAmount") or "")),
                    "total_amount": self.parse_money_value(str(prize.get("totalPrizeamount") or "")),
                }
            )
        return breakdown

    def _default_prize_breakdown(self) -> list[dict[str, Any]]:
        if self.lottery_code == "pl3":
            return build_pl3_prize_breakdown()
        if self.lottery_code == "pl5":
            return build_pl5_prize_breakdown()
        if self.lottery_code == "qxc":
            return build_qxc_prize_breakdown()
        return []

    def _sum_sporttery_prize_total(self, prize_rows: Any) -> int:
        return sum(
            self.parse_money_value(str(prize.get("totalPrizeamount") or ""))
            for prize in list(prize_rows or [])
            if isinstance(prize, dict)
        )

    @staticmethod
    def _normalize_sporttery_draw_date(value: Any) -> str:
        raw_value = str(value or "").strip()
        if not raw_value:
            return ""
        normalized = raw_value[:10].replace("/", "-").replace(".", "-")
        date_match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", normalized)
        if not date_match:
            return ""
        return f"{int(date_match.group(1)):04d}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"

    def fetch_page(self, url: str, retry: int = 3) -> BeautifulSoup | None:
        for attempt in range(retry):
            try:
                self.logger.info(
                    "Fetching lottery history page",
                    extra={"context": {"attempt": attempt + 1, "retry": retry, "url": url}},
                )
                response = self.session.get(url, timeout=30)
                response.encoding = self._resolve_response_encoding(response)
                if response.status_code == 200:
                    return BeautifulSoup(response.text, "html.parser")
                self.logger.warning("Unexpected HTTP status", extra={"context": {"status_code": response.status_code}})
            except requests.exceptions.RequestException as exc:
                self.logger.warning("Lottery history request failed", extra={"context": {"error": str(exc)}})
                if attempt < retry - 1:
                    time.sleep(2)
        return None

    def parse_lottery_data(self, soup: BeautifulSoup) -> list[dict[str, Any]]:
        if self.lottery_code == "pl3":
            return self.parse_pl3_data(soup)
        if self.lottery_code == "pl5":
            return self.parse_pl5_data(soup)
        if self.lottery_code == "qxc":
            return self.parse_qxc_data(soup)
        data_list: list[dict[str, Any]] = []
        table = soup.find("tbody") or soup.find("table")
        if not table:
            self.logger.warning("No lottery table found")
            return data_list

        for row in table.find_all("tr"):
            cols = row.find_all("td")
            if len(cols) < 9:
                continue
            try:
                period = cols[0].text.strip()
                detail_payload = self.fetch_draw_detail(period)
                data_list.append(
                    {
                        "period": period,
                        "red_balls": [cols[i].text.strip() for i in range(1, 6)],
                        "blue_balls": [cols[i].text.strip() for i in range(6, 8)],
                        "date": cols[-1].text.strip() if len(cols) > 8 else "",
                        "prize_breakdown": detail_payload["prize_breakdown"],
                        "jackpot_pool_balance": detail_payload["jackpot_pool_balance"],
                    }
                )
            except Exception as exc:
                self.logger.warning("Failed to parse row", extra={"context": {"error": str(exc)}})

        self.logger.info("Parsed lottery draws", extra={"context": {"count": len(data_list)}})
        return data_list

    def parse_lskj_data(self, soup: BeautifulSoup) -> list[dict[str, Any]]:
        data_list: list[dict[str, Any]] = []
        for row in soup.find_all("tr"):
            cols = [cell.get_text(" ", strip=True) for cell in row.find_all("td")]
            if len(cols) < 3:
                continue
            period = cols[0].strip()
            if not period.isdigit():
                continue
            parsed_row = self._parse_datachart_lskj_row(cols)
            if parsed_row:
                data_list.append(parsed_row)
                continue
            numbers = re.findall(r"\d{1,2}", cols[2])
            if self.lottery_code == "dlt":
                if len(numbers) < 7:
                    continue
                data_list.append(
                    {
                        "period": period,
                        "red_balls": [value.zfill(2) for value in numbers[:5]],
                        "blue_balls": [value.zfill(2) for value in numbers[5:7]],
                        "date": cols[1].strip(),
                        "sales_amount": self.parse_money_value(cols[3]) if len(cols) > 3 else 0,
                        "jackpot_pool_balance": self.parse_money_value(cols[4]) if len(cols) > 4 else 0,
                        "prize_total_amount": self.parse_money_value(cols[5]) if len(cols) > 5 else 0,
                        "prize_breakdown": self._build_lskj_prize_breakdown(cols, ["一等奖", "二等奖", "三等奖"], start_index=6),
                    }
                )
                continue
            if self.lottery_code == "pl3":
                if len(numbers) < 3:
                    continue
                prize_breakdown = self._build_lskj_prize_breakdown(cols, ["直选", "组选3", "组选6"], start_index=6)
                data_list.append(
                    {
                        "period": period,
                        "digits": normalize_digit_balls(numbers[:3]),
                        "date": cols[1].strip(),
                        "sales_amount": self.parse_money_value(cols[3]) if len(cols) > 3 else 0,
                        "jackpot_pool_balance": self.parse_money_value(cols[4]) if len(cols) > 4 else 0,
                        "prize_total_amount": self.parse_money_value(cols[5]) if len(cols) > 5 else 0,
                        "prize_breakdown": prize_breakdown or build_pl3_prize_breakdown(),
                    }
                )
                continue
            if self.lottery_code == "pl5":
                if len(numbers) < 5:
                    continue
                prize_breakdown = self._build_lskj_prize_breakdown(cols, ["直选"], start_index=6)
                data_list.append(
                    {
                        "period": period,
                        "digits": normalize_digit_balls(numbers[:5]),
                        "date": cols[1].strip(),
                        "sales_amount": self.parse_money_value(cols[3]) if len(cols) > 3 else 0,
                        "jackpot_pool_balance": self.parse_money_value(cols[4]) if len(cols) > 4 else 0,
                        "prize_total_amount": self.parse_money_value(cols[5]) if len(cols) > 5 else 0,
                        "prize_breakdown": prize_breakdown or build_pl5_prize_breakdown(),
                    }
                )
                continue
            if self.lottery_code == "qxc":
                if len(numbers) < 7:
                    continue
                data_list.append(
                    {
                        "period": period,
                        "digits": normalize_digit_balls(numbers[:7]),
                        "date": cols[1].strip(),
                        "sales_amount": self.parse_money_value(cols[3]) if len(cols) > 3 else 0,
                        "jackpot_pool_balance": self.parse_money_value(cols[4]) if len(cols) > 4 else 0,
                        "prize_total_amount": self.parse_money_value(cols[5]) if len(cols) > 5 else 0,
                        "prize_breakdown": self._build_lskj_prize_breakdown(cols, ["一等奖", "二等奖", "三等奖"], start_index=6)
                        or build_qxc_prize_breakdown(),
                    }
                )
        self.logger.info("Parsed lskj lottery draws", extra={"context": {"count": len(data_list), "lottery_code": self.lottery_code}})
        return data_list

    def _parse_datachart_lskj_row(self, cols: list[str]) -> dict[str, Any] | None:
        period = cols[0].strip()
        if not period.isdigit():
            return None
        if len(cols) > 1 and self._looks_like_date(cols[1]):
            return None
        if self.lottery_code == "dlt":
            if len(cols) < 15:
                return None
            red_balls = [value.strip().zfill(2) for value in cols[1:6]]
            blue_balls = [value.strip().zfill(2) for value in cols[6:8]]
            if not self._are_numeric_values(red_balls + blue_balls):
                return None
            return {
                "period": period,
                "red_balls": red_balls,
                "blue_balls": blue_balls,
                "date": cols[14].strip(),
                "sales_amount": self.parse_money_value(cols[13]),
                "jackpot_pool_balance": self.parse_money_value(cols[8]),
                "prize_total_amount": 0,
                "prize_breakdown": self._build_lskj_prize_breakdown(cols, ["一等奖", "二等奖"], start_index=9),
            }
        if self.lottery_code == "pl3":
            if len(cols) < 11:
                return None
            digits = re.findall(r"\d", cols[1])
            if len(digits) < 3:
                return None
            prize_breakdown = self._build_lskj_prize_breakdown(cols, ["直选", "组选3", "组选6"], start_index=4)
            return {
                "period": period,
                "digits": normalize_digit_balls(digits[:3]),
                "date": cols[10].strip(),
                "sales_amount": self.parse_money_value(cols[3]),
                "jackpot_pool_balance": 0,
                "prize_total_amount": 0,
                "prize_breakdown": prize_breakdown or build_pl3_prize_breakdown(),
            }
        if self.lottery_code == "pl5":
            if len(cols) < 5:
                return None
            digits = re.findall(r"\d", cols[1])
            if len(digits) < 5:
                return None
            return {
                "period": period,
                "digits": normalize_digit_balls(digits[:5]),
                "date": cols[4].strip(),
                "sales_amount": self.parse_money_value(cols[3]),
                "jackpot_pool_balance": 0,
                "prize_total_amount": 0,
                "prize_breakdown": build_pl5_prize_breakdown(),
            }
        if self.lottery_code == "qxc":
            if len(cols) < 5:
                return None
            digits = re.findall(r"\d{1,2}", cols[1])
            if len(digits) < 7:
                return None
            return {
                "period": period,
                "digits": normalize_digit_balls(digits[:7]),
                "date": cols[4].strip(),
                "sales_amount": self.parse_money_value(cols[3]),
                "jackpot_pool_balance": 0,
                "prize_total_amount": 0,
                "prize_breakdown": build_qxc_prize_breakdown(),
            }
        return None

    @staticmethod
    def _are_numeric_values(values: list[str]) -> bool:
        return all(str(value or "").strip().isdigit() for value in values)

    @staticmethod
    def _looks_like_date(value: str) -> bool:
        return bool(re.fullmatch(r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}", str(value or "").strip()))

    def _build_lskj_prize_breakdown(self, cols: list[str], prize_levels: list[str], *, start_index: int) -> list[dict[str, Any]]:
        breakdown: list[dict[str, Any]] = []
        for offset, prize_level in enumerate(prize_levels):
            count_index = start_index + offset * 2
            amount_index = count_index + 1
            if amount_index >= len(cols):
                break
            winner_count = self.parse_money_value(cols[count_index])
            prize_amount = self.parse_money_value(cols[amount_index])
            breakdown.append(
                {
                    "prize_level": prize_level,
                    "prize_type": "basic",
                    "winner_count": winner_count,
                    "prize_amount": prize_amount,
                    "total_amount": winner_count * prize_amount,
                }
            )
        return breakdown

    def parse_pl3_data(self, soup: BeautifulSoup) -> list[dict[str, Any]]:
        data_list: list[dict[str, Any]] = []
        default_jackpot_pool_balance = self.parse_jackpot_pool_balance(soup)
        for row in soup.find_all("tr"):
            cols = row.find_all("td")
            if len(cols) < 3:
                continue
            period = cols[0].get_text(strip=True)
            date = cols[1].get_text(strip=True)
            digit_nodes = cols[2].select(".ball") or cols[2].find_all("span")
            digits = [node.get_text(strip=True) for node in digit_nodes if node.get_text(strip=True)]
            if not period.isdigit() or len(digits) < 3:
                continue
            jackpot_pool_balance = default_jackpot_pool_balance
            if len(cols) >= 5:
                jackpot_pool_balance = self.parse_money_value(cols[4].get_text(strip=True))
            data_list.append(
                {
                    "period": period,
                    "digits": normalize_digit_balls(digits[:3]),
                    "date": date,
                    "jackpot_pool_balance": jackpot_pool_balance,
                    "prize_breakdown": build_pl3_prize_breakdown(),
                }
            )
        self.logger.info("Parsed lottery draws", extra={"context": {"count": len(data_list), "lottery_code": self.lottery_code}})
        return data_list

    def parse_pl5_data(self, soup: BeautifulSoup) -> list[dict[str, Any]]:
        data_list: list[dict[str, Any]] = []
        jackpot_pool_balance = self.parse_jackpot_pool_balance(soup)
        detail_jackpot_cache: dict[str, int] = {}
        for row in soup.find_all("tr"):
            cols = row.find_all("td")
            if len(cols) < 2:
                continue
            period = cols[0].get_text(strip=True)
            date = cols[-1].get_text(strip=True)
            raw_digits_text = cols[1].get_text(" ", strip=True)
            digits = re.findall(r"\d", raw_digits_text)
            if not period.isdigit() or len(digits) < 5:
                continue
            period_jackpot_pool_balance = jackpot_pool_balance
            if period_jackpot_pool_balance <= 0:
                cached = detail_jackpot_cache.get(period)
                if cached is None:
                    detail_payload = self.fetch_draw_detail(period)
                    cached = int(detail_payload.get("jackpot_pool_balance") or 0)
                    detail_jackpot_cache[period] = cached
                period_jackpot_pool_balance = cached
            data_list.append(
                {
                    "period": period,
                    "digits": normalize_digit_balls(digits[:5]),
                    "date": date,
                    "jackpot_pool_balance": period_jackpot_pool_balance,
                    "prize_breakdown": build_pl5_prize_breakdown(),
                }
            )
        self.logger.info("Parsed lottery draws", extra={"context": {"count": len(data_list), "lottery_code": self.lottery_code}})
        return data_list

    def parse_qxc_data(self, soup: BeautifulSoup) -> list[dict[str, Any]]:
        data_list: list[dict[str, Any]] = []
        detail_nodes = soup.select(".qxc_info")
        if detail_nodes:
            period_text = detail_nodes[0].get_text(" ", strip=True)
            period_match = re.search(r"第?(\d{5,})期", period_text)
            date_match = re.search(r"(\d{4}-\d{2}-\d{2})", period_text)
            digits = [item.get_text(strip=True) for item in detail_nodes[0].select(".numballs b") if item.get_text(strip=True)]
            jackpot = self.parse_jackpot_pool_balance(detail_nodes[0])
            if period_match and len(digits) >= 7:
                period = period_match.group(1)
                detail_payload = self.fetch_draw_detail(period)
                data_list.append(
                    {
                        "period": period,
                        "digits": normalize_digit_balls(digits[:7]),
                        "date": date_match.group(1) if date_match else "",
                        "jackpot_pool_balance": jackpot or int(detail_payload.get("jackpot_pool_balance") or 0),
                        "prize_breakdown": detail_payload.get("prize_breakdown") or build_qxc_prize_breakdown(),
                    }
                )

        for row in soup.select("table.zj_table tbody tr"):
            cols = row.find_all("td")
            if len(cols) < 3:
                continue
            period_match = re.search(r"(\d{5,})", cols[1].get_text(" ", strip=True))
            digits = re.findall(r"\d{1,2}", cols[2].get_text(" ", strip=True))
            date_match = re.search(r"(\d{4}-\d{2}-\d{2})", row.get_text(" ", strip=True))
            if not period_match or len(digits) < 7:
                continue
            period = period_match.group(1)
            detail_payload = self.fetch_draw_detail(period)
            data_list.append(
                {
                    "period": period,
                    "digits": normalize_digit_balls(digits[:7]),
                    "date": date_match.group(1) if date_match else str(detail_payload.get("draw_date") or ""),
                    "jackpot_pool_balance": int(detail_payload.get("jackpot_pool_balance") or 0),
                    "prize_breakdown": detail_payload.get("prize_breakdown") or build_qxc_prize_breakdown(),
                }
            )
        deduplicated: dict[str, dict[str, Any]] = {}
        for item in data_list:
            deduplicated[str(item.get("period") or "")] = item
        result = sorted(deduplicated.values(), key=lambda item: str(item.get("period") or ""), reverse=True)
        self.logger.info("Parsed lottery draws", extra={"context": {"count": len(result), "lottery_code": self.lottery_code}})
        return result

    def _backfill_qxc_draws(self, draws: list[dict[str, Any]], *, target_count: int) -> list[dict[str, Any]]:
        if target_count <= 0:
            return draws
        deduplicated: dict[str, dict[str, Any]] = {
            str(item.get("period") or "").strip(): dict(item)
            for item in draws
            if str(item.get("period") or "").strip()
        }
        if len(deduplicated) >= target_count:
            return sorted(deduplicated.values(), key=lambda item: str(item.get("period") or ""), reverse=True)
        numeric_periods = [int(period) for period in deduplicated if period.isdigit()]
        if not numeric_periods:
            return sorted(deduplicated.values(), key=lambda item: str(item.get("period") or ""), reverse=True)
        seed_period = min(numeric_periods)
        period_width = len(str(seed_period))
        current_period = str(seed_period).zfill(period_width)
        current_draw_date = self._parse_date_text(str(deduplicated.get(current_period, {}).get("date") or ""))
        consecutive_misses = 0
        while len(deduplicated) < target_count and consecutive_misses < 12:
            previous_period, previous_draw_date = self._resolve_previous_qxc_period(current_period, current_draw_date)
            if not previous_period:
                break
            current_period = previous_period
            current_draw_date = previous_draw_date
            if previous_period in deduplicated:
                continue
            draw = self.fetch_qxc_draw_by_period(previous_period)
            if not draw:
                consecutive_misses += 1
                continue
            deduplicated[previous_period] = draw
            current_draw_date = self._parse_date_text(str(draw.get("date") or "")) or current_draw_date
            consecutive_misses = 0
        result = sorted(deduplicated.values(), key=lambda item: str(item.get("period") or ""), reverse=True)
        self.logger.info(
            "Backfilled qxc draws",
            extra={
                "context": {
                    "requested_count": target_count,
                    "result_count": len(result),
                }
            },
        )
        return result

    def _resolve_previous_qxc_period(self, period: str, draw_date: date | None) -> tuple[str | None, date | None]:
        normalized_period = str(period or "").strip()
        if normalized_period.isdigit() and len(normalized_period) >= 5 and draw_date is not None:
            year_width = len(normalized_period) - 3
            seq = int(normalized_period[-3:])
            full_year = draw_date.year
            if seq > 1:
                previous_seq = seq - 1
                previous_year_token = normalized_period[:year_width]
            else:
                previous_full_year = full_year - 1
                previous_seq = self._count_qxc_draws_in_year(previous_full_year)
                previous_year_token = (
                    str(previous_full_year % 100).zfill(year_width)
                    if year_width == 2
                    else str(previous_full_year).zfill(year_width)
                )
            previous_period = f"{previous_year_token}{previous_seq:03d}"
            return previous_period, self._previous_qxc_draw_date(draw_date)
        if not normalized_period.isdigit():
            return None, draw_date
        fallback = int(normalized_period) - 1
        if fallback <= 0:
            return None, draw_date
        if fallback % 1000 == 0:
            fallback -= 1
        return str(fallback).zfill(len(normalized_period)), draw_date

    @staticmethod
    def _previous_qxc_draw_date(value: date) -> date:
        probe = value - timedelta(days=1)
        while probe.weekday() not in {1, 4, 6}:
            probe -= timedelta(days=1)
        return probe

    @staticmethod
    def _count_qxc_draws_in_year(year: int) -> int:
        start = date(year, 1, 1)
        end = date(year, 12, 31)
        count = 0
        probe = start
        while probe <= end:
            if probe.weekday() in {1, 4, 6}:
                count += 1
            probe += timedelta(days=1)
        return count

    @staticmethod
    def _parse_date_text(value: str) -> date | None:
        normalized = str(value or "").strip()
        if not normalized:
            return None
        for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
            try:
                return datetime.strptime(normalized[:10], fmt).date()
            except ValueError:
                continue
        return None

    def fetch_qxc_draw_by_period(self, period: str) -> dict[str, Any] | None:
        if self.lottery_code != "qxc":
            return None
        row = self.fetch_sporttery_draw_by_period(period)
        parsed = self.parse_sporttery_draw(row) if row else None
        if parsed:
            return parsed
        detail_payload = self.fetch_fallback_draw_detail(period)
        digits = list(detail_payload.get("digits") or [])
        if len(digits) < 7:
            return None
        return {
            "period": str(period),
            "digits": normalize_digit_balls(digits[:7]),
            "date": str(detail_payload.get("draw_date") or ""),
            "jackpot_pool_balance": int(detail_payload.get("jackpot_pool_balance") or 0),
            "prize_breakdown": detail_payload.get("prize_breakdown") or build_qxc_prize_breakdown(),
        }

    def fetch_prize_breakdown(self, period: str) -> list[dict[str, Any]]:
        return self.fetch_draw_detail(period)["prize_breakdown"]

    def backfill_draw_detail(self, period: str) -> dict[str, Any]:
        normalized_period = str(period or "").strip()
        if not normalized_period:
            raise ValueError("期号不能为空")
        existing_draw = self.lottery_service.get_draw_by_period(normalized_period, lottery_code=self.lottery_code)
        if not existing_draw:
            raise ValueError(f"未找到 {self.lottery_code} 第 {normalized_period} 期的基础开奖记录")
        detail_payload = self.fetch_draw_detail(normalized_period)
        prize_breakdown = list(detail_payload.get("prize_breakdown") or [])
        if not prize_breakdown:
            raise ValueError(f"未抓取到 {self.lottery_code} 第 {normalized_period} 期的奖金明细")
        refreshed_draw = {
            "period": normalized_period,
            "red_balls": list(existing_draw.get("red_balls") or []),
            "blue_balls": list(existing_draw.get("blue_balls") or []),
            "digits": list(existing_draw.get("digits") or []),
            "date": str(detail_payload.get("draw_date") or existing_draw.get("date") or ""),
            "sales_amount": int(existing_draw.get("sales_amount") or 0),
            "jackpot_pool_balance": int(detail_payload.get("jackpot_pool_balance") or existing_draw.get("jackpot_pool_balance") or 0),
            "prize_total_amount": int(existing_draw.get("prize_total_amount") or 0),
            "prize_breakdown": prize_breakdown,
        }
        saved_draws = self.lottery_service.save_draws([refreshed_draw], lottery_code=self.lottery_code)
        saved_draw = saved_draws[0] if saved_draws else refreshed_draw
        self.logger.info(
            "Backfilled single draw detail",
            extra={
                "context": {
                    "lottery_code": self.lottery_code,
                    "period": normalized_period,
                    "prize_breakdown_count": len(prize_breakdown),
                    "jackpot_pool_balance": saved_draw.get("jackpot_pool_balance"),
                }
            },
        )
        return {
            "lottery_code": self.lottery_code,
            "period": normalized_period,
            "date": saved_draw.get("date"),
            "jackpot_pool_balance": saved_draw.get("jackpot_pool_balance"),
            "prize_breakdown_count": len(prize_breakdown),
        }

    def fetch_draw_detail(self, period: str) -> dict[str, Any]:
        row = self.fetch_sporttery_draw_by_period(period)
        if not row:
            return self.fetch_fallback_draw_detail(period)
        prize_breakdown = self.parse_sporttery_prize_breakdown(row.get("prizeLevelList"))
        if not prize_breakdown:
            fallback_payload = self.fetch_fallback_draw_detail(period)
            if fallback_payload.get("prize_breakdown"):
                return fallback_payload
        return {
            "prize_breakdown": prize_breakdown or self._default_prize_breakdown(),
            "jackpot_pool_balance": self.parse_money_value(str(row.get("poolBalanceAfterdraw") or row.get("poolBalance") or "")),
            "draw_date": self._normalize_sporttery_draw_date(row.get("lotteryDrawTime")),
        }

    def fetch_sporttery_draw_by_period(self, period: str) -> dict[str, Any] | None:
        normalized_period = str(period or "").strip()
        if not normalized_period:
            return None
        page_size = self.SPORTTERY_DETAIL_PAGE_SIZE
        for page_no in range(1, self.SPORTTERY_DETAIL_MAX_PAGES + 1):
            rows = self.fetch_sporttery_history_page(page_no=page_no, page_size=page_size)
            if not rows:
                return None
            for row in rows:
                if str(row.get("lotteryDrawNum") or "").strip() == normalized_period:
                    return row
            last_periods = [int(str(row.get("lotteryDrawNum") or "0")) for row in rows if str(row.get("lotteryDrawNum") or "").isdigit()]
            if normalized_period.isdigit() and last_periods and int(normalized_period) > max(last_periods):
                return None
        return None

    def build_detail_url(self, period: str) -> str | None:
        template = self.DETAIL_URL_TEMPLATES.get(self.lottery_code)
        if not template:
            return None
        return template.format(period=period)

    def fetch_fallback_draw_detail(self, period: str) -> dict[str, Any]:
        detail_url = self.build_detail_url(period)
        if not detail_url:
            return {
                "prize_breakdown": self._default_prize_breakdown(),
                "jackpot_pool_balance": 0,
                "draw_date": "",
            }
        if hasattr(self, "session"):
            self.session.headers.update({"Referer": self.FALLBACK_HISTORY_REFERERS.get(self.lottery_code, "https://www.500.com/")})
        soup = self.fetch_page(detail_url, retry=2)
        if not soup:
            return {
                "prize_breakdown": self._default_prize_breakdown(),
                "jackpot_pool_balance": 0,
                "draw_date": "",
            }
        if self.lottery_code in {"pl3", "pl5"}:
            return {
                "prize_breakdown": self._default_prize_breakdown(),
                "jackpot_pool_balance": self.parse_jackpot_pool_balance(soup),
                "draw_date": self.parse_draw_date(soup),
            }
        if self.lottery_code == "qxc":
            return {
                "digits": self.parse_qxc_digits(soup),
                "prize_breakdown": self.parse_qxc_prize_breakdown(soup),
                "jackpot_pool_balance": self.parse_jackpot_pool_balance(soup),
                "draw_date": self.parse_draw_date(soup),
            }
        return {
            "prize_breakdown": self.parse_prize_breakdown(soup),
            "jackpot_pool_balance": self.parse_jackpot_pool_balance(soup),
            "draw_date": self.parse_draw_date(soup),
        }

    def parse_prize_breakdown(self, soup: BeautifulSoup) -> list[dict[str, Any]]:
        for table in soup.find_all("table"):
            headers = [cell.get_text(strip=True) for cell in table.find_all("th")]
            if "奖项" not in headers or "每注奖金(元)" not in headers:
                continue

            breakdown: list[dict[str, Any]] = []
            current_prize_level = ""
            for row in table.find_all("tr"):
                cells = [cell.get_text(" ", strip=True) for cell in row.find_all("td")]
                if not cells or cells[0] == "合计":
                    continue
                if len(cells) >= 5:
                    prize_level, prize_type, winner_count, prize_amount, total_amount = cells[:5]
                    current_prize_level = prize_level
                elif len(cells) == 4 and current_prize_level:
                    prize_level = current_prize_level
                    prize_type, winner_count, prize_amount, total_amount = cells[:4]
                else:
                    continue
                breakdown.append(
                    {
                        "prize_level": prize_level,
                        "prize_type": "additional" if "追加" in prize_type else "basic",
                        "winner_count": self.parse_money_value(winner_count),
                        "prize_amount": self.parse_money_value(prize_amount),
                        "total_amount": self.parse_money_value(total_amount),
                    }
                )
            if breakdown:
                return breakdown
        return []

    def parse_qxc_prize_breakdown(self, soup: BeautifulSoup) -> list[dict[str, Any]]:
        for table in soup.find_all("table"):
            headers = [cell.get_text(strip=True) for cell in table.find_all("th")]
            if not headers:
                for row in table.find_all("tr")[:4]:
                    candidate_headers = [cell.get_text(strip=True) for cell in row.find_all("td")]
                    if len(candidate_headers) < 3:
                        continue
                    normalized_candidate_headers = [
                        header.replace("（", "(").replace("）", ")").replace(" ", "") for header in candidate_headers
                    ]
                    if any(header in {"奖级", "奖项"} for header in normalized_candidate_headers):
                        headers = candidate_headers
                        break
            normalized_headers = [header.replace("（", "(").replace("）", ")").replace(" ", "") for header in headers]
            has_prize_header = any(header in {"奖级", "奖项"} for header in normalized_headers)
            has_count_header = any("中奖注数" in header for header in normalized_headers)
            has_amount_header = any("每注奖额" in header or "单注奖金" in header for header in normalized_headers)
            if not has_prize_header or not has_count_header or not has_amount_header:
                continue
            breakdown: list[dict[str, Any]] = []
            for row in table.find_all("tr"):
                cells = [cell.get_text(" ", strip=True) for cell in row.find_all("td")]
                if len(cells) < 3:
                    continue
                prize_level = cells[0].strip()
                if not prize_level.endswith("等奖"):
                    continue
                if "注" not in cells[1] and not re.search(r"\d", cells[1]):
                    continue
                breakdown.append(
                    {
                        "prize_level": prize_level,
                        "prize_type": "basic",
                        "winner_count": self.parse_money_value(cells[1]),
                        "prize_amount": self.parse_money_value(cells[2]),
                        "total_amount": self.parse_money_value(cells[3]) if len(cells) > 3 else 0,
                    }
                )
            if breakdown:
                prize_map = {item["prize_level"]: item for item in breakdown}
                return [prize_map.get(item["prize_level"], item) for item in build_qxc_prize_breakdown()]
        return build_qxc_prize_breakdown()

    @staticmethod
    def parse_qxc_digits(soup: BeautifulSoup) -> list[str]:
        selectors = [
            ".numballs b",
            ".kj_tablelist01 .num em",
            ".kj_tablelist01 td.redball",
            ".open_num b",
            ".ball_box li",
        ]
        for selector in selectors:
            values = [item.get_text(strip=True) for item in soup.select(selector)]
            digits = [value for value in values if re.fullmatch(r"\d{1,2}", value)]
            if len(digits) >= 7:
                return digits[:7]
        text_content = soup.get_text(" ", strip=True).replace("\xa0", " ")
        keyword_match = re.search(r"开奖号码[^0-9]{0,20}((?:\d{1,2}\D+){6}\d{1,2})", text_content)
        if keyword_match:
            digits = re.findall(r"\d{1,2}", keyword_match.group(1))
            if len(digits) >= 7:
                return digits[:7]
        return []

    def _resolve_response_encoding(self, response: requests.Response) -> str:
        if self.lottery_code in {"pl3", "pl5", "qxc"}:
            return response.apparent_encoding or "gb18030"
        return "utf-8"

    @staticmethod
    def parse_draw_date(soup: BeautifulSoup) -> str:
        text_content = soup.get_text(" ", strip=True).replace("\xa0", " ")
        match = re.search(r"开奖日期[：:\s]*([0-9]{4}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2})", text_content)
        if not match:
            return ""
        raw_value = match.group(1).replace("年", "-").replace("月", "-").replace("日", "")
        normalized = raw_value.replace("/", "-").replace(".", "-")
        date_match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", normalized)
        if not date_match:
            return ""
        return f"{int(date_match.group(1)):04d}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"

    def build_fallback_prize_breakdown(self) -> list[dict[str, Any]]:
        return [
            {
                "prize_level": prize_level,
                "prize_type": "basic",
                "winner_count": 0,
                "prize_amount": prize_amount,
                "total_amount": 0,
            }
            for prize_level, prize_amount in self.FIXED_PRIZE_RULES.items()
        ]

    @classmethod
    def parse_jackpot_pool_balance(cls, soup: BeautifulSoup) -> int:
        text_content = soup.get_text(" ", strip=True).replace("\xa0", " ")
        keyword_pattern = re.compile(r"(?:奖池(?:资金)?(?:余额|累计金额|金额)?|滚存(?:金额)?)")
        amount_pattern = re.compile(r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*(亿|万|元)")
        for keyword_match in keyword_pattern.finditer(text_content):
            scope = text_content[keyword_match.end() : keyword_match.end() + 48]
            amount_match = amount_pattern.search(scope)
            if not amount_match:
                continue
            amount = cls.parse_money_value(f"{amount_match.group(1)}{amount_match.group(2)}")
            if amount > 0:
                return amount
        return 0

    @staticmethod
    def parse_money_value(value: str) -> int:
        text = (
            str(value or "")
            .strip()
            .replace(",", "")
            .replace("，", "")
            .replace("人民币", "")
            .replace(" ", "")
            .replace("　", "")
        )
        if text.endswith("元"):
            text = text[:-1]
        if not text or text == "---":
            return 0
        unit = 1
        if text.endswith("亿"):
            unit = 100000000
            text = text[:-1]
        elif text.endswith("万"):
            unit = 10000
            text = text[:-1]
        try:
            return int(float(text) * unit)
        except ValueError:
            return 0
