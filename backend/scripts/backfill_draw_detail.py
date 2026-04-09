#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import sys

SCRIPT_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_ROOT)
REPO_ROOT = os.path.dirname(PROJECT_ROOT)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.lotteries import normalize_lottery_code
from backend.app.services.lottery_fetch_service import LotteryFetchService


logger = get_logger("scripts.backfill_draw_detail")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Backfill a single lottery draw detail by lottery code and period.")
    parser.add_argument("lottery_code", help="Lottery code, e.g. dlt/pl3/pl5/qxc")
    parser.add_argument("period", help="Target period to refresh")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    lottery_code = normalize_lottery_code(args.lottery_code)
    period = str(args.period).strip()

    ensure_schema()
    result = LotteryFetchService(lottery_code=lottery_code).backfill_draw_detail(period)
    logger.info("Single draw detail backfill complete", extra={"context": result})


if __name__ == "__main__":
    main()
