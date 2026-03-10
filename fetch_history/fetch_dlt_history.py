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
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.db.connection import ensure_schema
from app.services.lottery_service import LotteryService


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
                print(f"Fetching data... ({attempt + 1}/{retry})")
                print(f"  URL: {url}")
                response = self.session.get(url, timeout=30)
                response.encoding = "utf-8"
                if response.status_code == 200:
                    return BeautifulSoup(response.text, "html.parser")
                print(f"HTTP status: {response.status_code}")
            except requests.exceptions.RequestException as exc:
                print(f"Request failed: {exc}")
                if attempt < retry - 1:
                    time.sleep(2)
        return None

    def parse_lottery_data(self, soup: BeautifulSoup) -> list[dict]:
        data_list: list[dict] = []
        table = soup.find("tbody") or soup.find("table")
        if not table:
            print("No lottery table found.")
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
                print(f"Failed to parse row: {exc}")

        print(f"Parsed {len(data_list)} draws.")
        return data_list

    def save_to_database(self, data: list[dict]) -> None:
        saved_draws = self.lottery_service.save_draws(data)
        print(f"\nSaved {len(saved_draws)} draws into PostgreSQL.")

    def fetch_and_save(
        self,
        output_file: str = "dlt_data.json",
        preserve_history: bool = True,
        start: str | None = None,
        end: str | None = None,
    ) -> bool:
        del output_file, preserve_history
        print("=" * 50)
        print("Super Lotto history fetcher")
        print("=" * 50)

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
            print("Failed to fetch page.")
            return False

        lottery_data = self.parse_lottery_data(soup)
        if not lottery_data:
            print("No draws parsed.")
            return False

        print("\nLatest 5 draws preview:")
        print("-" * 50)
        for item in lottery_data[:5]:
            print(
                f"Period: {item['period']} | "
                f"Red: {' '.join(item['red_balls'])} | "
                f"Blue: {' '.join(item['blue_balls'])} | "
                f"Date: {item['date']}"
            )

        self.save_to_database(lottery_data)
        return True


def main() -> None:
    fetcher = LotteryDataFetcher()
    success = fetcher.fetch_and_save()
    if success:
        print(f"\nCompleted at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
