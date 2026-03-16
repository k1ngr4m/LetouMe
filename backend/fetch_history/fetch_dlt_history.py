#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import os
import sys
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(PROJECT_ROOT)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app.logging_utils import get_logger
from backend.app.services.lottery_fetch_service import LotteryFetchService


logger = get_logger("fetch_history.dlt")


class LotteryDataFetcher(LotteryFetchService):
    """Backwards-compatible script entry for fetching Super Lotto history."""


def main() -> None:
    fetcher = LotteryDataFetcher()
    try:
        fetcher.fetch_and_save()
        logger.info("Fetch task completed", extra={"context": {"completed_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}})
    except Exception:
        sys.exit(1)


if __name__ == "__main__":
    main()
