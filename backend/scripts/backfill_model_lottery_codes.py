#!/usr/bin/env python3

from __future__ import annotations

import argparse

from backend.app.db.connection import ensure_schema, get_connection
from backend.app.logging_utils import get_logger


logger = get_logger("scripts.backfill_model_lottery_codes")
TARGET_LOTTERY_CODES = ("dlt", "pl3")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill ai_model_lottery to ensure all models support dlt and pl3.")
    parser.add_argument("--dry-run", action="store_true", help="Only print missing counts without writing data.")
    return parser.parse_args()


def count_missing_models(cursor, lottery_code: str) -> int:
    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM ai_model am
        LEFT JOIN ai_model_lottery aml
            ON aml.model_id = am.id AND aml.lottery_code = ?
        WHERE aml.model_id IS NULL
        """,
        (lottery_code,),
    )
    row = cursor.fetchone() or {}
    return int(row.get("total") or 0)


def main() -> None:
    args = parse_args()
    ensure_schema()
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS total FROM ai_model")
            model_total = int((cursor.fetchone() or {}).get("total") or 0)
            summary: dict[str, int] = {}
            for lottery_code in TARGET_LOTTERY_CODES:
                missing_count = count_missing_models(cursor, lottery_code)
                summary[f"missing_{lottery_code}"] = missing_count
                if args.dry_run or missing_count == 0:
                    continue
                cursor.execute(
                    """
                    INSERT IGNORE INTO ai_model_lottery (model_id, lottery_code)
                    SELECT id, ?
                    FROM ai_model
                    """,
                    (lottery_code,),
                )
                summary[f"inserted_{lottery_code}"] = int(cursor.rowcount or 0)

    logger.info(
        "Model lottery backfill completed",
        extra={
            "context": {
                "dry_run": args.dry_run,
                "model_total": model_total,
                **summary,
            }
        },
    )
    print({"dry_run": args.dry_run, "model_total": model_total, **summary})


if __name__ == "__main__":
    main()
