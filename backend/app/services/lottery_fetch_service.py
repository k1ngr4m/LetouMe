from __future__ import annotations

import re
import time
from typing import Any

import requests
from bs4 import BeautifulSoup

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.lotteries import build_pl3_prize_breakdown, build_pl5_prize_breakdown, normalize_digit_balls, normalize_lottery_code
from backend.app.services.lottery_service import LotteryService


class LotteryFetchService:
    DETAIL_URL_TEMPLATES = {
        "dlt": "https://kaijiang.500.com/shtml/dlt/{period}.shtml",
        "pl3": "https://kaijiang.500.com/shtml/pls/{period}.shtml",
        "pl5": "https://kaijiang.500.com/shtml/plw/{period}.shtml",
    }
    FIXED_PRIZE_RULES = {
        "三等奖": 10000,
        "四等奖": 3000,
        "五等奖": 300,
        "六等奖": 200,
        "七等奖": 100,
        "八等奖": 15,
        "九等奖": 5,
    }

    def __init__(self, lottery_service: LotteryService | None = None, lottery_code: str = "dlt") -> None:
        self.lottery_code = normalize_lottery_code(lottery_code)
        self.base_url = (
            "https://datachart.500.com/dlt/history/newinc/history.php"
            if self.lottery_code == "dlt"
            else "https://www.500.com/kaijiang/p3/lskj/"
            if self.lottery_code == "pl3"
            else "https://datachart.500.com/plw/history/inc/history.php"
        )
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/91.0.4472.124 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": (
                "https://datachart.500.com/dlt/history/history.shtml"
                if self.lottery_code == "dlt"
                else "https://www.500.com/kaijiang/p3/lskj/"
                if self.lottery_code == "pl3"
                else "https://datachart.500.com/plw/history/history.shtml"
            ),
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        ensure_schema()
        self.lottery_service = lottery_service or LotteryService()
        self.logger = get_logger("services.lottery_fetch")

    def fetch_and_save(
        self,
        *,
        start: str | None = None,
        end: str | None = None,
        limit: int | None = 30,
    ) -> dict[str, Any]:
        started_at = time.perf_counter()
        url = self.base_url
        params: list[str] = []
        if start:
            params.append(f"start={start}")
        if end:
            params.append(f"end={end}")
        if limit is not None:
            params.append(f"limit={max(1, int(limit))}")
        if params:
            url = f"{url}?{'&'.join(params)}"

        soup = self.fetch_page(url)
        if not soup:
            raise ValueError("获取开奖历史页面失败")

        lottery_data = self.parse_lottery_data(soup)
        if not lottery_data:
            raise ValueError("未解析到开奖数据")
        if limit is not None:
            lottery_data = lottery_data[: max(1, int(limit))]

        saved_draws = self.lottery_service.save_draws(lottery_data, lottery_code=self.lottery_code)
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        summary = {
            "lottery_code": self.lottery_code,
            "fetched_count": len(lottery_data),
            "saved_count": len(saved_draws),
            "latest_period": saved_draws[0]["period"] if saved_draws else None,
            "duration_ms": duration_ms,
        }
        self.logger.info("Fetched and saved lottery history", extra={"context": summary})
        return summary

    def fetch_page(self, url: str, retry: int = 3) -> BeautifulSoup | None:
        for attempt in range(retry):
            try:
                self.logger.info(
                    "Fetching lottery history page",
                    extra={"context": {"attempt": attempt + 1, "retry": retry, "url": url}},
                )
                response = self.session.get(url, timeout=30)
                if self.lottery_code in {"pl3", "pl5"}:
                    response.encoding = response.apparent_encoding or "gb18030"
                else:
                    response.encoding = "utf-8"
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

    def fetch_prize_breakdown(self, period: str) -> list[dict[str, Any]]:
        return self.fetch_draw_detail(period)["prize_breakdown"]

    def fetch_draw_detail(self, period: str) -> dict[str, Any]:
        detail_url = self.build_detail_url(period)
        if not detail_url:
            return {"prize_breakdown": [], "jackpot_pool_balance": 0}
        if self.lottery_code in {"pl3", "pl5"}:
            soup = self.fetch_page(detail_url, retry=2)
            if not soup:
                return {
                    "prize_breakdown": build_pl3_prize_breakdown() if self.lottery_code == "pl3" else build_pl5_prize_breakdown(),
                    "jackpot_pool_balance": 0,
                }
            return {
                "prize_breakdown": build_pl3_prize_breakdown() if self.lottery_code == "pl3" else build_pl5_prize_breakdown(),
                "jackpot_pool_balance": self.parse_jackpot_pool_balance(soup),
            }
        soup = self.fetch_page(detail_url, retry=2)
        if not soup:
            return {"prize_breakdown": [], "jackpot_pool_balance": 0}
        parsed = self.parse_prize_breakdown(soup)
        return {
            "prize_breakdown": parsed,
            "jackpot_pool_balance": self.parse_jackpot_pool_balance(soup),
        }

    def build_detail_url(self, period: str) -> str | None:
        template = self.DETAIL_URL_TEMPLATES.get(self.lottery_code)
        if not template:
            return None
        return template.format(period=period)

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
