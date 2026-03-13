#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import os
import sys
import time
from datetime import datetime

import requests
from bs4 import BeautifulSoup

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(PROJECT_ROOT)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.services.lottery_service import LotteryService


logger = get_logger("fetch_history.dlt")


class LotteryDataFetcher:
    """Fetch Super Lotto history data and persist it into PostgreSQL."""

    def __init__(self) -> None:
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
        self.lottery_service = LotteryService()

    def fetch_page(self, url: str, retry: int = 3) -> BeautifulSoup | None:
        for attempt in range(retry):
            try:
                logger.info(
                    "Fetching lottery history page",
                    extra={"context": {"attempt": attempt + 1, "retry": retry, "url": url}},
                )
                response = self.session.get(url, timeout=30)
                response.encoding = "utf-8"
                if response.status_code == 200:
                    return BeautifulSoup(response.text, "html.parser")
                logger.warning("Unexpected HTTP status", extra={"context": {"status_code": response.status_code}})
            except requests.exceptions.RequestException as exc:
                logger.warning("Lottery history request failed", extra={"context": {"error": str(exc)}})
                if attempt < retry - 1:
                    time.sleep(2)
        return None

    def parse_lottery_data(self, soup: BeautifulSoup) -> list[dict]:
        data_list: list[dict] = []
        table = soup.find("tbody") or soup.find("table")
        if not table:
            logger.warning("No lottery table found")
            return data_list

        rows = table.find_all("tr")
        for row in rows:
            cols = row.find_all("td")
            if len(cols) < 9:
                continue

            try:
                period = cols[0].text.strip()
                red_balls = [cols[i].text.strip() for i in range(1, 6)]
                blue_balls = [cols[i].text.strip() for i in range(6, 8)]
                draw_date = cols[-1].text.strip() if len(cols) > 8 else ""
                data_list.append(
                    {
                        "period": period,
                        "red_balls": red_balls,
                        "blue_balls": blue_balls,
                        "date": draw_date,
                    }
                )
            except Exception as exc:
                logger.warning("Failed to parse row", extra={"context": {"error": str(exc)}})

        logger.info("Parsed lottery draws", extra={"context": {"count": len(data_list)}})
        return data_list

    def save_to_database(self, data: list[dict]) -> None:
        saved_draws = self.lottery_service.save_draws(data)
        logger.info("Saved lottery draws", extra={"context": {"count": len(saved_draws)}})

    def fetch_and_save(
        self,
        output_file: str = "dlt_data.json",
        preserve_history: bool = True,
        start: str | None = None,
        end: str | None = None,
    ) -> bool:
        del output_file, preserve_history
        started_at = time.perf_counter()
        logger.info("Super Lotto history fetcher started")

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
            logger.error("Failed to fetch lottery history page")
            return False

        lottery_data = self.parse_lottery_data(soup)
        if not lottery_data:
            logger.error("No draws parsed from fetched page")
            return False

        logger.info("Latest draws preview follows", extra={"context": {"preview_count": min(5, len(lottery_data))}})
        for item in lottery_data[:5]:
            logger.info(
                "Preview draw",
                extra={
                    "context": {
                        "period": item["period"],
                        "red": " ".join(item["red_balls"]),
                        "blue": " ".join(item["blue_balls"]),
                        "date": item["date"],
                    }
                },
            )

        self.save_to_database(lottery_data)
        logger.info(
            "Super Lotto history fetcher finished",
            extra={"context": {"duration_ms": round((time.perf_counter() - started_at) * 1000, 2)}},
        )
        return True


def main() -> None:
    fetcher = LotteryDataFetcher()
    success = fetcher.fetch_and_save()
    if success:
        logger.info("Fetch task completed", extra={"context": {"completed_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}})
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
