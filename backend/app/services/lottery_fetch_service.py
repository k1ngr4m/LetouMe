from __future__ import annotations

import time
from typing import Any

import requests
from bs4 import BeautifulSoup

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.services.lottery_service import LotteryService


class LotteryFetchService:
    def __init__(self, lottery_service: LotteryService | None = None) -> None:
        self.base_url = "https://datachart.500.com/dlt/history/newinc/history.php"
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/91.0.4472.124 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": "https://datachart.500.com/dlt/history/history.shtml",
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
    ) -> dict[str, Any]:
        started_at = time.perf_counter()
        url = self.base_url
        params: list[str] = []
        if start:
            params.append(f"start={start}")
        if end:
            params.append(f"end={end}")
        if params:
            url = f"{url}?{'&'.join(params)}"

        soup = self.fetch_page(url)
        if not soup:
            raise ValueError("获取大乐透历史页面失败")

        lottery_data = self.parse_lottery_data(soup)
        if not lottery_data:
            raise ValueError("未解析到大乐透开奖数据")

        saved_draws = self.lottery_service.save_draws(lottery_data)
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        summary = {
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
                data_list.append(
                    {
                        "period": cols[0].text.strip(),
                        "red_balls": [cols[i].text.strip() for i in range(1, 6)],
                        "blue_balls": [cols[i].text.strip() for i in range(6, 8)],
                        "date": cols[-1].text.strip() if len(cols) > 8 else "",
                    }
                )
            except Exception as exc:
                self.logger.warning("Failed to parse row", extra={"context": {"error": str(exc)}})

        self.logger.info("Parsed lottery draws", extra={"context": {"count": len(data_list)}})
        return data_list
